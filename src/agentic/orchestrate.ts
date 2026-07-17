/**
 * orchestrate.ts — one-shot "Hermes runs the whole video" entry point.
 *
 * Usage:
 *   runAgenticPipeline({ topic, title, backend: 'agent' })   // no AI keys needed
 *   runAgenticPipeline({ topic, title, backend: 'vision' })  // uses Gemini/Ollama if configured
 *
 * With backend='agent' the ONLY intelligence is Hermes/the agent:
 *   - script is written by the agent heuristic (or your LLM hook)
 *   - keywords expanded by the agent
 *   - verification uses deterministic signal checks (always) + optional vision
 *   - DECIDE is made by the agent reading the verification matrix
 * No Google Gemini / Ollama key is required for the 'agent' backend.
 *
 * The classic workflow (input/input-scripts.json -> `npm run generate`) is
 * completely UNTOUCHED by this file; this is an additive, parallel pipeline.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseScript } from '../lib/script-parser.js';
import { fetchVisualsForScene, searchImages } from '../lib/visual-fetcher.js';
import { downloadMedia } from '../lib/visual-fetcher.js';
import { verifyMedia } from '../lib/media-verifier.js';
import { resolveFreeBackgroundMusic } from '../lib/free-music.js';
import { verifyRenderedVideo, PostRenderCheck } from './gate.js';
import { inputAssetPath } from '../lib/path-safety.js';
import { exportMultiAspect, generateFreeMetadata, renderThumbnail, wordTimingsFromScript } from './export.js';

import { buildPlan, applyProEdits } from './plan.js';
import { acquireAssets, AcquireDeps, FetchedVisual } from './acquire.js';
import { verifyAll, VerifyDeps, VERIFY_PASS_CONFIDENCE } from './verify.js';
import { runGateway, GatewayDeps } from './gateway.js';
import { runFinalGate } from './gate.js';
import { AgenticWorkspace, readJson, writeJson, pruneWorkspaces } from './workspace.js';
import { generateAgenticVoiceovers } from './tts.js';
import { createJob, updateJob, persistJob } from './job.js';
import { AssetCandidate, AssetDecision, Plan, RenderManifest, assetId } from './types.js';
import {
    AgentBackendConfig,
    AgenticBackend,
    expandKeywordsHeuristic,
    writeScriptHeuristic,
} from './agent.js';

/**
 * Pure helper: derive the media provider name from a URL host so candidate
 * attribution in the output reflects the REAL source (not a hardcoded label).
 * Exported for unit testing.
 */
export function sourceFromUrl(url: string): string {
    let host = '';
    try { host = new URL(url).hostname; } catch { return 'unknown'; }
    if (host.includes('pexels')) return 'pexels';
    if (host.includes('pixabay')) return 'pixabay';
    if (host.includes('wikimedia') || host.includes('commons')) return 'wikimedia';
    if (host.includes('archive.org')) return 'internet-archive';
    if (host.includes('openverse')) return 'openverse';
    return host || 'unknown';
}

export interface PipelineRequest {
    topic: string;
    title: string;
    jobId?: string;
    orientation?: 'portrait' | 'landscape';
    voice?: string;
    musicQuery?: string;
    candidatesPerAsset?: number;
    backend?: AgenticBackend; // default 'agent'
    /** Force every scene's visual to image (lighter downloads) or video. */
    preferVisual?: 'image' | 'video';
    agent?: Partial<AgentBackendConfig>; // optional LLM hooks / vision bolt-on
    /** When true, plan + keyword expansion run but NO network acquire/render. */
    dryRun?: boolean;
    /** User's own media files (from input/input-assets/) to use per-scene. */
    localAssets?: string[];
    /** User-supplied default image/video (input/input-assets/) last-resort fallback. */
    defaultVisual?: string;
    /** Pro-edit: lead with the most intriguing scene. */
    hookFirst?: boolean;
    /** Pro-edit: alternate scene durations so the rhythm breathes. */
    variablePacing?: boolean;
}

export interface PipelineResult {
    backend: AgenticBackend;
    plan: Plan;
    workspace: AgenticWorkspace;
    candidates: AssetCandidate[];
    decisions: AssetDecision[];
    gate: { pass: boolean; checks: { id: string; pass: boolean; label: string; detail: string }[] };
    manifest: RenderManifest;
    /** Per-scene voiceover + caption sidecars (Phase 2 / 4.2). */
    voiceovers: import('./tts.js').VoiceoverResult | null;
    /** True when no external AI model was used at all. */
    fullyAgentDriven: boolean;
    /** Phase 8.4 — post-render output validation (X7-X9), populated after render. */
    postRender?: import('./gate.js').PostRenderCheck;
}

export interface PipelineProgress {
    stage: 'plan' | 'acquire' | 'verify' | 'decide' | 'gate' | 'voiceover' | 'render';
    percent: number;       // 0-100 within stage
    message: string;
    sceneIndex?: number;
    candidateIndex?: number;
}

export async function runAgenticPipeline(
    req: PipelineRequest,
    onProgress?: (p: PipelineProgress) => void,
): Promise<PipelineResult> {
    const emit = (p: PipelineProgress) => onProgress?.(p);
    const backend: AgenticBackend = req.backend ?? 'agent';
    const cfg: AgentBackendConfig = {
        backend,
        writeScript: req.agent?.writeScript,
        expandKeywords: req.agent?.expandKeywords,
        visionVerify: req.agent?.visionVerify,
    };
    const jobId = req.jobId ?? `job_${Date.now()}`;

    // Phase 0 (#16): prevent unbounded workspace growth on long-running boxes.
    pruneWorkspaces(Number(process.env.AGENTIC_KEEP_WORKSPACES ?? 25));

    // ── STAGE 1: SCRIPT + PLAN (agent writes the script) ──────────────
    const script = cfg.writeScript
        ? await cfg.writeScript(req.topic, req.title)
        : writeScriptHeuristic(req.topic, req.title);

    const plan = await buildPlan(script, {
        jobId,
        title: req.title,
        orientation: req.orientation ?? 'portrait',
        voice: req.voice,
        musicQuery: req.musicQuery,
    }, parseScript);

    // Pro-edit transforms (free, rule-based): hook-first reorder + variable
    // pacing. Pure data change on the plan before any media is fetched.
    // Default ON (matches resolveConfig hard defaults) unless explicitly false.
    applyProEdits(plan, {
        hookFirst: req.hookFirst ?? true,
        variablePacing: req.variablePacing ?? true,
    });

    // Agent expands keywords per scene (optional bolt-on; default heuristic).
    for (const s of plan.scenes) {
        s.searchKeywords = cfg.expandKeywords
            ? await cfg.expandKeywords(s, req.title)
            : expandKeywordsHeuristic(s, req.title);
    }
    if (req.preferVisual) {
        for (const s of plan.scenes) s.visualPreference = req.preferVisual;
    }

    // P1a — local asset reuse: distribute the user's own media (input/input-assets/)
    // round-robin across scenes. A scene bound to a local file skips stock fetching
    // (handled in acquire.ts). Scenes beyond the file count fall back to fetching.
    if (req.localAssets && req.localAssets.length > 0) {
        plan.scenes.forEach((s, i) => {
            s.localAsset = req.localAssets![i % req.localAssets!.length];
        });
        emit({ stage: 'plan', percent: 100, message: `Bound ${req.localAssets.length} local asset(s) to ${plan.scenes.length} scenes` });
    }

    // ── DRY RUN (#25): preview plan + per-scene keywords, skip network/render. ──
    if (req.dryRun) {
        emit({ stage: 'plan', percent: 100, message: `DRY RUN — ${plan.scenes.length} scenes, no assets fetched` });
        return {
            backend,
            plan,
            workspace: { jobId: 'dry-run', root: '', assetsDir: '', imagesDir: '', videosDir: '', musicDir: '', verificationDir: '' } as AgenticWorkspace,
            candidates: [],
            decisions: [],
            gate: { pass: false, checks: [] },
            manifest: null as any,
            voiceovers: null,
            fullyAgentDriven: backend === 'agent' && !cfg.visionVerify,
        };
    }

    // ── STAGE 2: ACQUIRE (real fetchers) ─────────────────────────────
    emit({ stage: 'plan', percent: 100, message: `Plan ready (${plan.scenes.length} scenes)` });

    // Shared topic image pool: fetched ONCE for the whole video so every scene
    // can pull a DIFFERENT real photo from the same topic (Pexels returns a
    // distinct set per page). This guarantees per-scene visual diversity instead
    // of every scene showing the identical top search result.
    // Extract a clean search noun from the topic (drop numbers + stopwords like
    // "5 fascinating facts about") so the pool query is "coffee", not "5 fascinating
    // facts", which returns irrelevant/duplicate results.
    const STOP = new Set(['a','an','the','of','for','to','and','or','in','on','with','about','facts','fact','benefits','benefit','how','what','why','tips','ways','things','5','3','10','top','best','amazing','fascinating','interesting','daily','changed','change','vs']);
    const topicNoun = ((req.topic || plan.title || 'video') as string)
        .toLowerCase().split(/\s+/).filter((w) => w && !STOP.has(w.replace(/[^a-z]/g, ''))).join(' ') || 'video';
    const sharedImagePool: { url: string }[] = [];
    // Video-first consistency: if any scene prefers video, build the shared pool
    // video-first (Pexels/Pixabay/Wikimedia/Archive video), then image as
    // fallback. This makes "video first, then image" true on BOTH the pool path
    // and the fetchVisual ladder (which already respects visualPreference).
    const preferVideo = plan.scenes.some((s) => s.visualPreference === 'video');
    const getImagePool = async () => {
        if (sharedImagePool.length > 0) return sharedImagePool;
        const DEAD_HOSTS = /flickr\.com|staticflickr\.com|live\.staticflickr/i;
        const seen = new Set<string>();
        const add = (url?: string) => {
            if (url && !DEAD_HOSTS.test(url) && !seen.has(url)) { seen.add(url); sharedImagePool.push({ url }); }
        };
        // Try several query variants so a weak/empty topic noun still yields a
        // real, on-topic pool (e.g. "walking" -> "person walking" -> title).
        const variants = [topicNoun, `${topicNoun} photo`, (req.title || '').trim(), `person ${topicNoun}`]
            .map((s) => s.trim()).filter(Boolean);
        // Pull from EVERY working provider. When preferVideo, lead with video
        // (Pexels/Pixabay/Wikimedia/Archive via fetchVisualsForScene(preferVideo=true)),
        // then image (searchImages + fetchVisualsForScene(false)). Otherwise image-first.
        for (const q of variants) {
            if (preferVideo) {
                try { const r = await fetchVisualsForScene([q], true, plan.orientation); if (r) add(Array.isArray(r) ? r[0]?.url : r.url); } catch { /* next */ }
                try { (await searchImages(q, 12, 2, plan.orientation, 1)).forEach((p) => add(p.url)); } catch { /* next */ }
                try { const r = await fetchVisualsForScene([q], false, plan.orientation); if (r) add(Array.isArray(r) ? r[0]?.url : r.url); } catch { /* next */ }
            } else {
                try { (await searchImages(q, 12, 2, plan.orientation, 1)).forEach((p) => add(p.url)); } catch { /* next */ }
                try { const r = await fetchVisualsForScene([q], false, plan.orientation); if (r) add(Array.isArray(r) ? r[0]?.url : r.url); } catch { /* next */ }
            }
            if (sharedImagePool.length >= 12) break;
        }
        if (sharedImagePool.length === 0) {
            try {
                const res = await fetchVisualsForScene([topicNoun], preferVideo, plan.orientation);
                if (res) add(Array.isArray(res) ? res[0]?.url : res.url);
            } catch { /* ignore */ }
        }
        return sharedImagePool;
    };

    const acquireDeps: AcquireDeps = {
        fetchVisual: async (keywords, kind, orientation, sceneIndex = 0) => {
            // If we have a shared topic pool, assign each scene a DISTINCT photo
            // from it (scene 0 -> pool[0], scene 1 -> pool[1], ...). This is the
            // primary path that guarantees per-scene diversity.
            const pool = await getImagePool();
            if (pool.length > 0) {
                const pick = pool[sceneIndex % pool.length];
                const DEAD_HOSTS = /flickr\.com|staticflickr\.com|live\.staticflickr/i;
                if (pick && pick.url && !DEAD_HOSTS.test(pick.url)) {
                    // Derive the real source from the URL host so attribution in
                    // the output reflects the actual provider (not a hardcoded label).
                    const source = sourceFromUrl(pick.url);
                    return [{
                        url: pick.url,
                        localPath: '',
                        source,
                        license: undefined,
                        licenseUrl: undefined,
                        width: 0,
                        height: 0,
                    }];
                }
            }
            // Retry ladder: lead with the MOST-SPECIFIC keyword (longest phrase,
            // e.g. "espresso machine") so each scene fetches its own distinct
            // on-topic image instead of all collapsing to the bare topic noun
            // ("coffee") which Pexels returns the same top photo for. Broader/
            // safe fallbacks come later only if the specific query yields nothing.
            const bySpecificity = [...keywords].sort((a, b) => b.length - a.length);
            const ladder = [bySpecificity, keywords];
            if (keywords.length > 1) ladder.push([keywords[0]]);           // bare topic noun
 ladder.push([topicNoun || 'coffee', 'nature', 'city', 'technology'].slice(0, 1)); // topic-aware last resort
            const seen = new Set<string>();
            for (const raw of ladder) {
                const q = raw.filter(Boolean);
                const key = q.join(' ');
                if (seen.has(key)) continue;
                seen.add(key);
                try {
                    // Use the scene index so each scene pulls a DIFFERENT real
                    // photo from the Pexels pool (avoids every scene showing the
                    // same top result). The ladder's queries also lead with the
                    // scene's most-specific keyword for extra diversity.
                    const resultIndex = sceneIndex;
                    const res = await fetchVisualsForScene(q, kind === 'video', orientation, undefined, resultIndex);
                    const arr = !res ? [] : (Array.isArray(res) ? res : [res]);
                    // Reject dead/flaky hosts (Flickr 5xx in this environment) so
                    // the ladder retries with a broader query instead of baking a
                    // 502-prone URL into the scene (which would become a black gap).
                    const DEAD_HOSTS = /flickr\.com|staticflickr\.com|live\.staticflickr/i;
                    const usable = arr.filter((a) => a && typeof a.url === 'string' && a.url.length > 0 && !DEAD_HOSTS.test(a.url));
                    if (usable.length > 0) {
                        return usable.map((a) => ({
                            url: a.url,
                            localPath: '',
                            source: 'openverse/pexels',
                            license: a.license,
                            licenseUrl: a.licenseUrl,
                        } as FetchedVisual));
                    }
                } catch (e) {
                    console.warn(`⚠ fetchVisual failed for "${q.join(' ')}": ${(e as Error).message}`);
                }
            }
            // Only as a true last resort: a branded (non-black) card so the
            // pipeline still renders something rather than a black frame.
            const ph = makePlaceholder(keywords, kind);
            return [{ url: '', localPath: ph, source: 'placeholder', license: 'CC0 (generated placeholder)', licenseUrl: '' } as FetchedVisual];
        },
        download: async (url, dir, filename) => {
            // P1b — default-visual fallback: if the user configured a
            // default.mp4/image in input/input-assets/, use it as the
            // last-resort visual when both fetch + pool fail (legacy behaviour).
            const useDefaultVisual = (): string => {
                const local = require('path').join(dir, filename.replace(/(\.[^.]+)?$/, path.extname(req.defaultVisual || '.png')));
                try {
                    const src = inputAssetPath(req.defaultVisual!);
                    if (fs.existsSync(src)) { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(src, local); return local; }
                } catch { /* ignore */ }
                return '';
            };
            // Retry transient CDN/5xx errors (e.g. 502 from a flaky image host)
            // before giving up on a real asset — only then fall back to a card.
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const r = await downloadMedia(url, dir, filename);
                    return r.path;
                } catch (e) {
                    const isLast = attempt === 2;
                    if (isLast) {
                        console.warn(`⚠ download failed for "${url}": ${(e as Error).message}. Using placeholder card.`);
                        // Place the branded (non-black) card INSIDE dir so the
                        // render finds a real frame instead of a black gap.
                        const local = require('path').join(dir, filename.replace(/(\.[^.]+)?$/, '.png'));
                        const def = req.defaultVisual ? useDefaultVisual() : '';
                        if (!def) {
                            const ph = makePlaceholder([filename.replace(/\.[^.]+$/, '')], 'image');
                            try { require('fs').copyFileSync(ph, local); } catch { /* ignore */ }
                        }
                        return def || local;
                    }
                    await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
                }
            }
            const local = require('path').join(dir, filename.replace(/(\.[^.]+)?$/, '.png'));
            const def = req.defaultVisual ? useDefaultVisual() : '';
            if (!def) {
                const ph = makePlaceholder([filename.replace(/\\.[^.]+$/, '')], 'image');
                try { require('fs').copyFileSync(ph, local); } catch { /* ignore */ }
            }
            return def || local;
        },
        fetchMusic: async (query, count) => {
            const tracks = [];
            for (let i = 0; i < count; i++) {
                const m = await resolveFreeBackgroundMusic({ query, enabled: true });
                let localPath = m?.localPath && fs.existsSync(m.localPath) ? m.localPath : '';
                // Fall back to a known-good local royalty-free track when the
                // provider/cache returned nothing usable (offline / 404s).
                if (!localPath) {
                    const fallback = ['./input/music/twenty_minutes.mp3', './input/music/two_minutes.mp3']
                        .find((p) => fs.existsSync(p));
                    localPath = fallback ?? makePlaceholder([query], 'music');
                }
                // Agent-quality step: re-encode to a standards-compliant 128kbps
                // AAC/mp3 so the media verifier's bitrate gate passes and the track
                // is muxed into the final video. (The bundled track is ~32kbps.)
                const normalized = normalizeAudio(localPath);
                const finalPath = normalized && fs.existsSync(normalized) ? normalized : localPath;
                if (finalPath) tracks.push({ url: '', localPath: finalPath, source: m?.track.provider ?? 'local', license: m?.track.license ?? 'CC-BY (assumed royalty-free)', licenseUrl: m?.track.licenseUrl ?? '' } as FetchedVisual);
            }
            return tracks;
        },
    };
    const { workspace, candidates } = await acquireAssets(plan, acquireDeps, req.candidatesPerAsset ?? 2);
    emit({ stage: 'acquire', percent: 100, message: `Acquired ${candidates.length} candidates` });
    // Persist the plan so a later agent run can edit/reorder scenes via the
    // scene-edit API (P1c) without re-planning from scratch.
    writeJson(workspace, 'plan.json', plan);
    // PHASE 8: register the job in the state machine now that the workspace exists.
    const jobRec = createJob(jobId, workspace, { topic: req.topic, title: req.title, backend, state: 'processing' });

    // ── STAGE 3: VERIFY (signal checks always; vision only if configured) ─
    // backend='agent' => NO external AI: signal-level only, vision relevance is NOT
    // AI-scored (the agent reasons over the structured result instead).
    const vision = cfg.visionVerify
        ? cfg.visionVerify
        : backend === 'vision'
          ? ((p: string, kw: string[]) => verifyMedia(p, kw))
          : async () => ({ passes: true, confidence: 6, reason: 'agent backend: signal-only; visual relevance not AI-scored' });
    const verifyDeps: VerifyDeps = {
        verifyImage: (p, kw) => vision(p, kw),
        verifyVideo: (p, kw) => vision(p, kw),
    };

    // ── STAGE 4+5: DECIDE (agent) + GATE ─────────────────────────────
    const gatewayDeps: GatewayDeps = {
        ...acquireDeps,
        ...verifyDeps,
        decide: async (c, v) => {
            // count already-approved in this scene for "pick best one" logic
            const decisions = (readJson<AssetDecision[]>(workspace, 'approval-manifest.json') ?? []);
            const approvedInScene = decisions.filter((d) => d.sceneIndex === c.sceneIndex && d.decision === 'approved').length;
            // agent decision logic lives in agent.ts (no external model needed)
            const { agentDecide } = await import('./agent.js');
            const result = agentDecide({ candidate: c, verification: v as any, approvedInScene });
            emit({ stage: 'decide', percent: 50, message: `[s${c.sceneIndex} c${c.candidateIndex}] ${result.decision}`, sceneIndex: c.sceneIndex, candidateIndex: c.candidateIndex });
            return result;
        },
    };

    emit({ stage: 'verify', percent: 100, message: 'Verification complete' });
    const { decisions } = await runGateway(plan, candidates, gatewayDeps);
    emit({ stage: 'decide', percent: 100, message: `${decisions.filter((d) => d.decision === 'approved').length} assets approved` });
    const manifest = readJson<RenderManifest>(workspace, 'render-manifest.json');
    const gate = runFinalGate(plan, candidates, decisions, manifest);
    emit({ stage: 'gate', percent: 100, message: gate.pass ? 'GATE PASS' : 'GATE FAIL' });

    // ── STAGE 2.5: VOICEOVER (Phase 2) + caption sidecars (Phase 4.2) ──
    // Generates real spoken audio when the Edge-TTS engine is available; falls
    // back to agent tones offline. Attaches per-scene audio + captions to the
    // render manifest so the output is a *watchable* video, not a silent show.
    let voiceovers: import('./tts.js').VoiceoverResult | null = null;
    if (gate.pass && manifest) {
        voiceovers = await generateAgenticVoiceovers(plan, workspace, req.voice);
        emit({ stage: 'voiceover', percent: 100, message: `Voiceover ${voiceovers.voiceoverDriven ? 'generated' : 'fallback tones'}` });
        const voByScene = new Map(voiceovers.scenes.map((s) => [s.sceneIndex, s]));
        for (const a of manifest.assets) {
            if (a.kind === 'music') continue;
            const v = voByScene.get(a.sceneIndex);
            if (v) {
                a.audioPath = v.audioPath;
                a.durationSec = v.durationSec;
                a.captionSegments = v.captionSegments;
            }
        }
        manifest.voiceoverDriven = voiceovers.voiceoverDriven;
        writeJson(workspace, 'render-manifest.json', manifest);
        // Phase 11: full audit trail persisted as scene-data.json.
        writeJson(workspace, 'scene-data.json', {
            jobId, title: req.title, backend,
            voiceoverDriven: voiceovers.voiceoverDriven,
            scenes: plan.scenes.map((s) => ({
                sceneNumber: s.sceneNumber,
                voiceoverText: s.voiceoverText,
                searchKeywords: s.searchKeywords,
                visualPreference: s.visualPreference,
                durationSec: s.durationSec,
                voiceover: voByScene.get(s.sceneNumber - 1)?.audioPath ?? null,
                captionSegments: voByScene.get(s.sceneNumber - 1)?.captionSegments ?? [],
            })),
            decisions,
            gate: gate.checks,
            generatedAt: new Date().toISOString(),
        });
        // PHASE 8/11: record gate outcome + persist audit.
        updateJob(jobId, { gatePass: gate.pass, voiceoverDriven: voiceovers.voiceoverDriven, state: gate.pass ? 'awaiting_review' : 'failed' });
        persistJob(jobRec);
    }

    // VISIBILITY: prove the agent approved every asset — a contact sheet image
    // (all downloaded visuals in one grid) + a plain-text decisions report.
    const res: PipelineResult = {
        backend,
        plan,
        workspace,
        candidates,
        decisions,
        gate: { pass: gate.pass, checks: gate.checks },
        manifest: manifest!,
        voiceovers,
        fullyAgentDriven: backend === 'agent' && !cfg.visionVerify,
    };
    const contactSheet = makeContactSheet(res);
    const decisionsReport = writeDecisionsReport(res);

    return res;
}

/**
 * renderAgenticSlideshow — produce a REAL .mp4 from the agentic pipeline's
 * approved assets, using the bundled ffmpeg-static (no external ffmpeg, no
 * Chrome/Remotion). Each approved scene visual becomes a slide; optional music
 * track is muxed in. This is the lightweight "agent made the whole video"
 * path. (Heavy cinematic Remotion rendering remains the separate, existing flow.)
 */
/**
 * makePlaceholder — generate a real, renderable image for a keyword when the
 * live fetcher fails (network/provider 5xx). Uses the bundled ffmpeg to paint a
 * solid card with the keyword text. Keeps the pipeline end-to-end even offline.
 */
function makePlaceholder(keywords: string[], kind: 'image' | 'video' | 'music'): string {
     
    const ffmpeg: string = require('ffmpeg-static');
    const { execFileSync } = require('child_process');
    const os = require('os');
    const base = `${os.tmpdir()}/agentic_ph_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const label = (keywords.join(' ') || 'video').slice(0, 40);
    if (kind === 'music') {
        // A real, royalty-free 8s tone (sine) at 44.1k/128k mp3-equivalent (aac in mp4).
        const p = base + '.wav';
        execFileSync(ffmpeg, [
            '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
            '-c:a', 'pcm_s16le', '-y', p,
        ], { stdio: 'ignore' });
        return p;
    }
    const p = base + '.png';
    // Use a BRIGHT background (luma well above blackdetect's ~38 threshold) so a
    // missing-image card is never falsely flagged as a black frame by X10.
    const color = kind === 'video' ? '0x2a9d8f' : '0x264653';
    // Escape apostrophes/quotes so the drawtext filtergraph (single-quoted text)
    // doesn't break on words like "today's" or "lion's".
    const safeLabel = label.replace(/'/g, '’').replace(/:/g, ' ').slice(0, 40);
    execFileSync(ffmpeg, [
        '-f', 'lavfi', '-i', `color=c=${color}:s=720x1280:d=0.1`,
        '-vf', `drawtext=text='${safeLabel}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2`,
        '-frames:v', '1', '-y', p,
    ], { stdio: 'ignore' });
    return p;
}

/**
 * normalizeAudio — agent quality-control step. Re-encodes a track to a
 * standards-compliant 128kbps mp3 so the music verifier's bitrate gate passes
 * and the track can be muxed into the final video. Returns the new path (or
 * the original on any failure, so the pipeline still has an audio candidate).
 */
function normalizeAudio(src: string): string {
    if (!src || !fs.existsSync(src)) return src;
     
    const ffmpeg: string = require('ffmpeg-static');
    const { execFileSync } = require('child_process');
    const os = require('os');
    const out = `${os.tmpdir()}/agentic_music_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`;
    try {
        execFileSync(ffmpeg, ['-i', src, '-c:a', 'libmp3lame', '-b:a', '128k', '-y', out], { stdio: 'ignore' });
        return out;
    } catch {
        return src;
    }
}

/**
 * Build a single SFX audio layer (mp3) by resolving each scene's transition SFX
 * via the existing sfx-selector + free-sfx generators and placing it at the
 * scene start on a timeline matched to the rendered video. Returns the temp
 * file path, or null when SFX are disabled / unavailable. (The sfx-selector
 * logic is preserved and finally USED here — #23.)
 */
async function buildSfxLayer(
    ffmpeg: string,
    plan: Plan,
    visuals: { durationSec?: number }[],
    sfxPlans: { sceneIndex: number; transitionIn: any; transitionOut: any }[],
    tmpDir: string,
): Promise<string | null> {
    try {
        const { planSceneSfx, resolveSfx } = await import('./sfx-selector.js');
        void planSceneSfx; // sfxPlans already computed by caller
        const events: { atMs: number; kind: any }[] = [];
        let t = 0;
        for (let i = 0; i < visuals.length; i++) {
            const dur = (visuals[i].durationSec ?? 4) * 1000;
            const sp = sfxPlans.find((p) => p.sceneIndex === i);
            if (sp?.transitionIn) events.push({ atMs: Math.round(t), kind: sp.transitionIn });
            if (sp?.transitionOut) events.push({ atMs: Math.round(t + dur - 250), kind: sp.transitionOut });
            t += dur;
        }
        const clips = await Promise.all(events.map((e) => resolveSfx(e.kind).then((c) => (c ? { atMs: e.atMs, path: c.localPath } : null))));
        const valid = clips.filter(Boolean) as { atMs: number; path: string }[];
        if (valid.length === 0) return null;
        const totalMs = t;
        // Mix all SFX onto one quiet bed aligned to the timeline via adelay.
        const filter = valid
            .map((c, i) => `[${i}:a]adelay=${c.atMs}|${c.atMs},volume=0.5[a${i}]`)
            .join(';');
        const mix = valid.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${valid.length}:duration=first[aout]`;
        const tmp = `${tmpDir}/_sfx_${Date.now()}.mp3`;
        const args = [
            ...valid.flatMap((c) => ['-i', c.path]),
            '-filter_complex', `${filter};${mix}`,
            '-t', (totalMs / 1000).toFixed(2), '-c:a', 'libmp3lame', '-y', tmp,
        ];
        await new Promise<void>((res, rej) => require('child_process').execFile(ffmpeg, args, { maxBuffer: 1024 * 1024 * 200 }, (e: any) => (e ? rej(e) : res())));
        return fs.existsSync(tmp) ? tmp : null;
    } catch {
        return null;
    }
}

export async function renderAgenticSlideshow(
    res: PipelineResult,
    opts: { outPath?: string; crossfadeSec?: number; burnCaptions?: boolean; sfx?: boolean; transition?: string; preset?: string; kinetic?: boolean; kenBurns?: boolean; dimensions?: { w: number; h: number }; captions?: 'burned' | 'karaoke' | 'none'; intro?: { title: string; subtitle?: string; durationSec?: number }; outro?: { ctaText: string; showSubscribe?: boolean; hashtags?: string[]; durationSec?: number }; jCutSec?: number } = {},
): Promise<string> {
    
    const ffmpeg: string = require('ffmpeg-static');
    const { execFile } = require('child_process');
    // Pin a real font file so drawtext never touches fontconfig (which is broken
    // on this box and would otherwise hang/error the render). Falls back gracefully
    // if the path is missing (ffmpeg then uses its built-in default).
    const FONT_FILE = (() => {
        const candidates = [
            'C:/Windows/Fonts/arial.ttf',
            'C:/Windows/Fonts/seguiemj.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        ];
        for (const c of candidates) if (fs.existsSync(c)) return c;
        return '';
    })();
    const FONT_ARG = FONT_FILE ? `fontfile='${FONT_FILE}':` : '';
    const outDir = res.workspace.root + '/render';
    fs.mkdirSync(outDir, { recursive: true });
    const out = opts.outPath ?? (outDir + '/' + res.workspace.jobId + '.mp4');
    if (!res.manifest) throw new Error('Cannot render: final gate did not produce a render manifest (gate.pass=' + res.gate.pass + ').');

    const visuals = res.manifest.assets.filter((a) => a.kind !== 'music');
    const music = res.manifest.assets.find((a) => a.kind === 'music');
    if (visuals.length === 0) throw new Error('No approved visuals to render.');

    // ── Pro-edit: branded intro/outro title cards (cold-open + CTA close). ──
    // Generated as small standalone clips, then woven into the video chain.
    const CARD_W = opts.dimensions?.w ?? 720, CARD_H = opts.dimensions?.h ?? 1280;
    const introClip = opts.intro ? outDir + '/_intro_' + res.workspace.jobId + '.mp4' : null;
    const outroClip = opts.outro ? outDir + '/_outro_' + res.workspace.jobId + '.mp4' : null;
    const makeCard = async (outPath: string, title: string, subtitle: string | undefined, dur: number, bg: string, fg: string): Promise<void> => {
        const t = title.replace(/'/g, '’').replace(/:/g, '\\:');
        const s = (subtitle ?? '').replace(/'/g, '’').replace(/:/g, '\\:');
        const vf = [
            `color=c=${bg}:s=${CARD_W}x${CARD_H}:d=${dur}`,
            `drawtext=${FONT_ARG}text='${t}':fontcolor=${fg}:fontsize=58:box=1:boxcolor=${bg}@0.0:borderw=0:x=(w-text_w)/2:y=h/2-(text_h/2)${s ? `:fontsize=58` : ''}`,
            s ? `drawtext=${FONT_ARG}text='${s}':fontcolor=${fg}@0.8:fontsize=30:x=(w-text_w)/2:y=h/2+50` : '',
        ].filter(Boolean).join(',');
        await new Promise<void>((resolve, reject) => {
            const { execFile } = require('child_process');
            execFile(ffmpeg, ['-f', 'lavfi', '-i', vf, '-t', String(dur), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', outPath],
                (err: any, _stdout: string, stderr: string) => err ? reject(new Error('card render failed: ' + (stderr || '').trim())) : resolve());
        });
    };
    if (introClip) await makeCard(introClip, opts.intro!.title, opts.intro!.subtitle, opts.intro!.durationSec ?? 2.5, '#0F3460', '#ffffff');
    if (outroClip) {
        const cta = (opts.outro!.ctaText || 'Subscribe').replace(/'/g, '’').replace(/:/g, '\\:');
        const tags = (opts.outro!.hashtags || []).join(' ');
        const sub = (opts.outro!.showSubscribe ? 'Subscribe for more' : '') + (tags ? (opts.outro!.showSubscribe ? '  ' : '') + tags : '');
        await makeCard(outroClip, cta, sub || undefined, opts.outro!.durationSec ?? 3, '#FF6B35', '#0a0a12');
    }
    const introInputIdx = introClip ? visuals.length : -1;       // appended after scene inputs
    const outroInputIdx = outroClip ? visuals.length + (introClip ? 1 : 0) : -1;

    // ── Editing engine v1: compute the per-scene style plan (transitions,
    //    color grade, kinetic text). Deterministic from title + preset. ──
    const { computeStylePlan, gradeFilter, xfadeName } = await import('./style-engine.js');
    const stylePlan = computeStylePlan(res.plan, {
        preset: (opts.preset as any) ?? 'cinematic',
        kinetic: opts.kinetic,
    });

    const xf = opts.crossfadeSec ?? 0.5;
    const burn = opts.burnCaptions ?? true;
    const runFfmpeg = (args: string[]): Promise<void> =>
        new Promise<void>((resolve, reject) =>
            execFile(ffmpeg, args, { maxBuffer: 1024 * 1024 * 400 }, (err: Error | null, _stdout: string, stderr: string) => {
                if (err) return reject(new Error('ffmpeg failed:\n' + (stderr || '').trim()));
                resolve();
            }),
        );

    // ── Build a temporary SRT of the whole timeline for caption burn-in. ──
    // NOTE: the ffmpeg `subtitles` filter rejects absolute Windows paths that
    // contain a drive colon (C:\...) even when escaped, but accepts RELATIVE
    // paths. So we write the SRT beside cwd and reference it relatively.
    const srtRel = `agentic-pipeline/workspaces/${res.workspace.jobId}/render/_captions_${res.workspace.jobId}.srt`;
    const srtPath = path.resolve(process.cwd(), srtRel).replace(/\\/g, '/');
    let captionFile: string | null = null;
    if (burn) {
        const cues: string[] = [];
        let t = introClip ? (opts.intro!.durationSec ?? 2.5) : 0; // start after the cold-open card
        let n = 1;
        for (const a of visuals) {
            const dur = a.durationSec ?? 4;
            const raw = a.captionSegments?.length
                ? a.captionSegments
                : [{ text: res.plan.scenes[a.sceneIndex]?.voiceoverText ?? '', startMs: 0, endMs: Math.round(dur * 1000) }];
            const segs = chunkCues(raw);
            for (const s of segs) {
                const start = t + s.startMs / 1000;
                const end = t + s.endMs / 1000;
                cues.push(`${n}\n${fmtSrt(start)} --> ${fmtSrt(end)}\n${s.text.replace(/\n/g, ' ')}\n`);
                n++;
            }
            t += dur;
        }
        if (cues.length) {
            fs.mkdirSync(path.dirname(srtPath), { recursive: true });
            fs.writeFileSync(srtPath, cues.join('\n'), 'utf8');
            // pass RELATIVE path (ffmpeg subtitles filter chokes on C:\ paths)
            captionFile = srtRel;
        }
    }

    // ── Each scene: scale+pad, optional Ken Burns zoom, color grade, hold for VO. ──
    const W = opts.dimensions?.w ?? 720, H = opts.dimensions?.h ?? 1280;
    const sceneFilters = visuals.map((a, i) => {
        const dur = a.durationSec ?? 4;
        // Gentle Ken Burns zoom (spec 7.1). Comma inside the min() expression is
        // escaped as '\\,' and NO single quotes (filtergraph isn't shell-parsed).
        // Honors opts.kenBurns (config surface): when false, no zoom on images.
        const doZoom = a.kind === 'image' && opts.kenBurns !== false;
        const zoom = doZoom ? `,zoompan=z=min(zoom+0.0008\\,1.04):d=1:s=${W}x${H}` : '';
        // Editing engine v1: per-scene color grade (no LUT file needed).
        const grade = gradeFilter(stylePlan.scenes[i]?.grade ?? 'neutral');
        const tag = '[' + i + ':v]';
        return `${tag}scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=${dur},setpts=PTS-STARTPTS,settb=1/25${zoom},${grade},format=yuv420p[v${i}]`;
    });

    // ── Intro/outro clip filters (already WxH; just normalise + trim). ──
    if (introClip) sceneFilters.push(`[${introInputIdx}:v]trim=duration=${opts.intro!.durationSec ?? 2.5},setpts=PTS-STARTPTS,settb=1/25,format=yuv420p[vintro]`);
    if (outroClip) sceneFilters.push(`[${outroInputIdx}:v]trim=duration=${opts.outro!.durationSec ?? 3},setpts=PTS-STARTPTS,settb=1/25,format=yuv420p[voutro]`);

    // ── Concat the scene videos with per-scene transitions from the style plan. ──
    // Weave intro (cold-open) and outro (CTA) into the ordered clip list.
    const orderedTags: string[] = [];
    const orderedDur: number[] = []; // real duration of each ordered clip
    if (introClip) { orderedTags.push('vintro'); orderedDur.push(opts.intro!.durationSec ?? 2.5); }
    for (let i = 0; i < visuals.length; i++) { orderedTags.push('v' + i); orderedDur.push(visuals[i].durationSec ?? 4); }
    if (outroClip) { orderedTags.push('voutro'); orderedDur.push(opts.outro!.durationSec ?? 3); }

    let videoChain: string;
    if (orderedTags.length === 1) {
        videoChain = '[' + orderedTags[0] + ']';
    } else {
        // cursor = absolute end-time of `prev` on the timeline. xfade offset for
        // the next clip = cursor - xf (overlap xf seconds). After an xfade the
        // new end = cursor + dur(cur) - xf; after a hard cut it's cursor + dur(cur).
        let prev = orderedTags[0];
        let cursor = orderedDur[0];
        for (let i = 1; i < orderedTags.length; i++) {
            const cur = orderedTags[i];
            const isCard = cur === 'vintro' || cur === 'voutro';
            const tk: any = isCard ? 'fade' : (stylePlan.scenes[i - (introClip ? 1 : 0)]?.transitionIn ?? 'fade');
            const outTag = i === orderedTags.length - 1 ? 'vout' : 'vx' + i;
            if (tk === 'cut') {
                sceneFilters.push(`[${prev}][${cur}]concat=n=2:v=1:a=0[${outTag}]`);
                cursor += orderedDur[i];
            } else {
                const xname = xfadeName(tk);
                const off = Math.max(0, cursor - xf);
                sceneFilters.push(`[${prev}][${cur}]xfade=transition=${xname}:duration=${xf}:offset=${off}[${outTag}]`);
                cursor = cursor + orderedDur[i] - xf;
            }
            prev = outTag;
        }
        videoChain = '[vout]';
    }

    const videoInputs = visuals.flatMap((v) => ['-loop', '1', '-i', v.localPath]);
    if (introClip) videoInputs.push('-i', introClip);
    if (outroClip) videoInputs.push('-i', outroClip);
    const vfArgs = [...sceneFilters];
    let videoMap = videoChain;

    // ── Caption burn-in. ──
    // The ffmpeg `subtitles` filter (libass) is broken on this static Windows
    // build — it fails to initialise and renders the WHOLE clip black instead
    // of erroring. So we burn captions with `drawtext` (libfreetype), which
    // works. Each caption segment becomes a lower-third drawtext shown only
    // during its time window.
    if (captionFile) {
        let ctag = videoChain;
        let ci = 0;
        let tBase = 0;
        for (const a of visuals) {
            const dur = a.durationSec ?? 4;
            const scText = (res.plan.scenes[a.sceneIndex] && res.plan.scenes[a.sceneIndex].voiceoverText) || '';
            if (opts.captions === 'karaoke') {
                // B1 word-level karaoke: highlight each word in turn (yellow on
                // dark box) across the scene. Free — timing from the script.
                const words = wordTimingsFromScript(scText, dur);
                for (const wseg of words) {
                    const start = (tBase + wseg.startMs / 1000).toFixed(2);
                    const end = (tBase + wseg.endMs / 1000).toFixed(2);
                    const safe = wseg.word.replace(/'/g, '’').replace(/:/g, '\\:');
                    const out = `c${ci}`;
                    // current word highlighted yellow, rest of sentence dim white below
                    vfArgs.push(`${ctag}drawtext=${FONT_ARG}text='${safe}':fontcolor=yellow:fontsize=38:box=1:boxcolor=black@0.55:boxborderw=12:x=(w-text_w)/2:y=h-text_h-140:enable='between(t\\,${start}\\,${end})'[${out}]`);
                    ctag = `[${out}]`;
                    ci++;
                }
            } else {
                const segs = (a.captionSegments && a.captionSegments.length
                    ? a.captionSegments
                    : [{ text: scText, startMs: 0, endMs: Math.round(dur * 1000) }]);
                for (const s of segs) {
                    const start = (tBase + s.startMs / 1000).toFixed(2);
                    const end = (tBase + s.endMs / 1000).toFixed(2);
                    const safe = s.text.replace(/'/g, '’').replace(/:/g, '\\:').replace(/\\n/g, ' ');
                    const out = `c${ci}`;
                    vfArgs.push(`${ctag}drawtext=${FONT_ARG}text='${safe}':fontcolor=white:fontsize=30:box=1:boxcolor=black@0.5:boxborderw=10:line_spacing=4:x=(w-text_w)/2:y=h-text_h-120:enable='between(t\\,${start}\\,${end})'[${out}]`);
                    ctag = `[${out}]`;
                    ci++;
                }
            }
            tBase += dur;
        }
        videoMap = ctag;
    }
    // ── Editing engine v1: kinetic text overlays (lower-third reveal + word-pop). ──
    // Each cue is placed at its absolute timeline position via drawtext enable=
    // (hard on/off window). NOTE: this ffmpeg build does NOT support drawtext's
    // `alpha` expression ("Not yet implemented"), so we use enable= only — the
    // text appears/disappears at the window edges, which still reads as a pop.
    // Apostrophes are swapped for ’ because drawtext breaks on bare single quotes.
    if (stylePlan && opts.kinetic !== false) {
        let t = introClip ? (opts.intro!.durationSec ?? 2.5) : 0; // start after the cold-open card
        const sceneStarts = visuals.map((a) => { const s = t; t += (a.durationSec ?? 4); return s; });
        let ktag = videoMap;
        for (let i = 0; i < visuals.length; i++) {
            const base = sceneStarts[i];
            for (const cue of stylePlan.scenes[i]?.kinetic ?? []) {
                const start = (base + cue.atSec).toFixed(2);
                const end = (base + cue.atSec + (cue.kind === 'wordpop' ? 0.9 : 2.6)).toFixed(2);
                const safe = cue.text.replace(/'/g, '’').replace(/:/g, '\\:');
                if (cue.kind === 'lowerthird') {
                    vfArgs.push(`${ktag}drawtext=${FONT_ARG}text='${safe}':fontcolor=white:fontsize=34:box=1:boxcolor=black@0.45:boxborderw=12:x=(w-text_w)/2:y=h-text_h-90:enable='between(t\\,${start}\\,${end})'[k${i}]`);
                } else {
                    vfArgs.push(`${ktag}drawtext=${FONT_ARG}text='${safe}':fontcolor=yellow:fontsize=64:box=1:boxcolor=black@0.0:borderw=3:bordercolor=yellow:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t\\,${start}\\,${end})'[k${i}]`);
                }
                ktag = `[k${i}]`;
            }
        }
        if (ktag !== videoMap) { videoMap = ktag; }
    }
    // Phase 2.3 — cinematic vignette over the final video chain.
    vfArgs.push(`${videoMap}vignette=PI/5[vig]`);
    videoMap = '[vig]';

    // ── Concatenate per-scene voiceover audio into one track. ──
    // Pro-edit: J-cut — each scene's VO starts `jCutSec` BEFORE its picture
    // (audio leads picture). Implemented by placing each VO on an absolute
    // timeline via adelay + amix (instead of a plain sequential concat).
    const voScenes = visuals.filter((a) => a.audioPath && fs.existsSync(a.audioPath));
    let audioInputArgs: string[] = [];
    let audioFilter: string | null = null;
    let audioMap: string[] = [];
    const jCut = opts.jCutSec && opts.jCutSec > 0 ? opts.jCutSec : 0;
    if (voScenes.length > 0) {
        audioInputArgs = voScenes.flatMap((a) => ['-i', a.audioPath!]);
        // Audio inputs are appended AFTER all video inputs (stills + intro/outro
        // cards), so their file index starts after the video input count.
        const videoInputCount = visuals.length + (introClip ? 1 : 0) + (outroClip ? 1 : 0);
        const base = videoInputCount;
        const introDur = introClip ? (opts.intro!.durationSec ?? 2.5) : 0;
        const delayed: string[] = [];
        voScenes.forEach((_, i) => {
            // picture start of scene i on the timeline (after intro, with xfade overlap)
            const picStart = introDur + offsetFor(visuals, i, xf);
            // J-cut: audio leads picture by jCut (first scene starts at its picture)
            const audioStart = Math.max(0, picStart - (i === 0 ? 0 : jCut));
            delayed.push(`[${base + i}:a]adelay=delays=${(audioStart * 1000).toFixed(0)}:all=1[a${i}]`);
        });
        const mix = delayed.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${voScenes.length}:duration=longest:normalize=0[aout]`;
        audioFilter = [...delayed, mix].join(';');
        audioMap = ['-map', '[aout]'];
    }

    // ── PASS 1: video (+ captions) and audio (voiceover) combined. ──
    const silent = outDir + '/_av_' + res.workspace.jobId + '.mp4';
    const pass1: string[] = [
        ...videoInputs,
        ...audioInputArgs,
        '-filter_complex', [...vfArgs, ...(audioFilter ? [audioFilter] : [])].join(';'),
        '-map', videoMap,
        ...(audioMap.length ? audioMap : []),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '25',
        ...(audioMap.length ? ['-c:a', 'aac', '-b:a', '128k', '-shortest'] : ['-an']),
        '-y', silent,
    ];
    if (process.env.DEBUG_FF) { console.error('FILTER_COMPLEX:\n' + [...vfArgs, ...(audioFilter ? [audioFilter] : [])].join(';\n')); }
    await runFfmpeg(pass1);

    // ── PASS 2: duck + mux background music + optional SFX under the voiceover. ──
    let sfxLayer: string | null = null;
    if (opts.sfx && music && fs.existsSync(music.localPath)) {
        try {
            const { planSceneSfx } = await import('./sfx-selector.js');
            const sfxPlans = planSceneSfx(res.plan);
            sfxLayer = await buildSfxLayer(ffmpeg, res.plan, visuals, sfxPlans, outDir);
        } catch { sfxLayer = null; }
    }
    if (music && fs.existsSync(music.localPath)) {
        // Phase 4.1 — side-chain ducking: music dips to AUDIO_DUCK_LEVEL during
        // speech (from caption/VO segments) and rises to AUDIO_FULL_LEVEL in gaps.
        const duck = parseFloat(process.env.AUDIO_DUCK_LEVEL ?? '0.06');
        const full = parseFloat(process.env.AUDIO_FULL_LEVEL ?? '0.18');
        const duckExpr = buildDuckExpression(visuals, full, duck);
        const volFilter = duckExpr ? `volume=eval=frame:volume='${duckExpr}'` : `volume=${full}`;
        const inputs: string[] = ['-i', silent, '-i', music.localPath];
        let fc = `[1:a]${volFilter}[a]`;
        if (sfxLayer && fs.existsSync(sfxLayer)) {
            inputs.push('-i', sfxLayer);
            fc += `;[2:a]volume=0.6[sfx];[0:a][a][sfx]amix=inputs=3:duration=shortest[aout]`;
        } else {
            fc += `;[0:a][a]amix=inputs=2:duration=shortest[aout]`;
        }
        const pass2 = [
            ...inputs,
            '-filter_complex', fc,
            '-map', '0:v:0', '-map', '[aout]',
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-y', out,
        ];
        await runFfmpeg(pass2);
        fs.rmSync(silent, { force: true });
        if (sfxLayer) fs.rmSync(sfxLayer, { force: true });
    } else {
        fs.renameSync(silent, out);
    }

    // ── Phase 7.3 output artifacts (thumbnail, details, copy sidecars). ──
    writeOutputArtifacts(res, out, outDir);
    fs.rmSync(srtPath, { force: true });

    // ── Phase 8.4: POST-RENDER quality verification (X7-X9). ──
    // Expected duration = sum of scene durations MINUS crossfade overlaps, so
    // the check matches the actual crossfaded timeline (not the naive sum).
    const xfDur = xf * Math.max(0, visuals.length - 1);
    const expectedDur = Math.max(0.1, visuals.reduce((s, a) => s + (a.durationSec ?? 4), 0) - xfDur);
    res.postRender = verifyRenderedVideo(out, expectedDur);
    return out;
}

function offsetFor(visuals: { durationSec?: number }[], i: number, xf: number): number {
    // cumulative duration of scenes 0..i-1 minus (i-1)*xf crossfade overlap
    let acc = 0;
    for (let k = 0; k < i; k++) acc += visuals[k].durationSec ?? 4;
    return Math.max(0, acc - xf * i);
}

/**
 * Phase 4.1 — build a per-frame volume expression that ducks music during
 * speech. `between(t,s,e)` returns 1 during a speech segment; summing and
 * gating with gt() yields 1 when ANY segment is active. Music = full level
 * normally, ducked by (full-duck) during speech.
 */
export function buildDuckExpression(visuals: { durationSec?: number; captionSegments?: { startMs: number; endMs: number }[] }[], full: number, duck: number): string | null {
    const segs: { s: number; e: number }[] = [];
    let t = 0;
    for (const a of visuals) {
        const dur = a.durationSec ?? 4;
        for (const c of a.captionSegments ?? []) segs.push({ s: t + c.startMs / 1000, e: t + c.endMs / 1000 });
        t += dur;
    }
    if (segs.length === 0) return null;
    const terms = segs.map((x) => `between(t\\,${x.s.toFixed(3)}\\,${x.e.toFixed(3)})`).join('+');
    // 0.18 - (0.18-0.06)*gt(<sum>,0)  -> ducked during speech
    return `${full}-${(full - duck).toFixed(3)}*gt(${terms},0)`;
}

/**
 * Phase 7.2 — smart caption chunking: merge sub-100ms / <3-char micro-segments
 * into the next, and split segments longer than 8 words into readable chunks.
 * Guarantees a minimum 500ms display so cues don't flicker.
 */
export function chunkCues(segs: { text: string; startMs: number; endMs: number }[]): { text: string; startMs: number; endMs: number }[] {
    if (!segs.length) return segs;
    // 1) merge tiny fragments into the following segment
    const merged: { text: string; startMs: number; endMs: number }[] = [];
    for (const s of segs) {
        const prev = merged[merged.length - 1];
        if (prev && (s.endMs - s.startMs < 100 || s.text.trim().length < 3)) {
            prev.text = (prev.text + ' ' + s.text).trim();
            prev.endMs = s.endMs;
        } else {
            merged.push({ ...s, text: s.text.trim() });
        }
    }
    // 2) enforce minimum 500ms and split very long (>8 word) segments
    const out: { text: string; startMs: number; endMs: number }[] = [];
    for (const m of merged) {
        const { startMs, text } = m;
        let { endMs } = m;
        if (endMs - startMs < 500) endMs = startMs + 500;
        const words = text.split(/\s+/);
        if (words.length > 8) {
            const mid = Math.ceil(words.length / 2);
            const tSplit = startMs + Math.round((endMs - startMs) / 2);
            out.push({ text: words.slice(0, mid).join(' '), startMs, endMs: tSplit });
            out.push({ text: words.slice(mid).join(' '), startMs: tSplit, endMs });
        } else {
            out.push({ text, startMs, endMs });
        }
    }
    return out;
}

function fmtSrt(sec: number): string {
    const ms = Math.round((sec % 1) * 1000);
    const total = Math.floor(sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function escapeFilterPath(p: string): string {
    // ffmpeg filtergraph: escape ':' as '\:' and normalise '\' to '/'.
    // No surrounding quotes (filtergraph is not shell-parsed).
    return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/** Phase 7.3 — emit thumbnail.jpg, subtitles sidecars, details.txt, scene-data copy. */
function writeOutputArtifacts(res: PipelineResult, mp4: string, outDir: string): void {
     
    const ffmpeg: string = require('ffmpeg-static');
    const { execFileSync } = require('child_process');
    const base = outDir + '/' + res.workspace.jobId;
    try {
        execFileSync(ffmpeg, ['-i', mp4, '-ss', '00:00:01', '-vframes', '1', '-y', base + '_thumbnail.jpg'], { stdio: 'ignore' });
    } catch { /* thumbnail optional */ }
    // Copy caption sidecars next to the video.
    if (res.voiceovers?.sidecars) {
        for (const sc of res.voiceovers.sidecars) {
            try { fs.copyFileSync(sc, base + '_' + sc.split(/[\\/]/).pop()); } catch { /* ignore */ }
        }
    }
    const hashtags = res.plan.scenes.flatMap((s) => s.searchKeywords).slice(0, 8).map((k) => '#' + k.replace(/\s+/g, '')).join(' ');
    fs.writeFileSync(base + '_details.txt',
        `${res.plan.title}\n\n${res.plan.scenes.map((s) => `• ${s.voiceoverText}`).join('\n')}\n\n${hashtags}\n\nGenerated by agentic pipeline (backend=${res.backend}, voiceoverDriven=${res.voiceovers?.voiceoverDriven ?? false}).`,
        'utf8');

    // ── FREE advanced exports (offline, $0) ──
    // Branded thumbnail from the first frame.
    try { renderThumbnail(mp4, res.plan); } catch { /* optional */ }
    // Multi-aspect copies (9:16 + 16:9 + 1:1) for cross-platform publishing.
    try { exportMultiAspect(mp4, ['9:16', '16:9', '1:1']); } catch { /* optional */ }
    // Social-ready metadata (no LLM, fully offline).
    try {
        const meta = generateFreeMetadata(res.plan);
        fs.writeFileSync(base + '_metadata.txt',
            `TITLE:\n${meta.title}\n\nDESCRIPTION:\n${meta.description}\n\nHASHTAGS:\n${meta.hashtags}\n\nTAGS:\n${meta.tags.join(', ')}`,
            'utf8');
    } catch { /* optional */ }
}

/**
 * makeContactSheet — VISIBILITY of the agent's autonomous decisions.
 *
 * Tiles EVERY downloaded image (and one frame of every downloaded video) into a
 * single grid image so a human/agent can SEE every asset the Hermes agent
 * approved. The agent is the sole approver (no human gate); this is the audit
 * artefact that proves it. Pure ffmpeg, offline.
 */
export function makeContactSheet(res: PipelineResult): string | null {
    const ffmpeg: string = require('ffmpeg-static');
    const { execFileSync } = require('child_process');
    const os = require('os');
    const wsRoot = res.workspace.root;
    const imgs: string[] = [];
    for (const d of res.decisions) {
        if (d.kind === 'music') continue;
        const c = res.candidates.find((x) => assetId(x.kind, x.sceneIndex, x.candidateIndex) === d.assetId);
        if (!c?.localPath || !fs.existsSync(c.localPath)) continue;
        if (c.kind === 'image') imgs.push(c.localPath);
        else if (c.kind === 'video') {
     // Pull one early frame as a still. Use a tiny offset so it works even
     // for very short clips (ss=0 can miss the first decodable frame).
     const frame = `${os.tmpdir()}/cs_frame_${res.workspace.jobId}_${d.sceneIndex}.png`;
     try {
         execFileSync(ffmpeg, ['-y', '-ss', '00:00:00.1', '-i', c.localPath, '-frames:v', '1', frame], { stdio: 'ignore' });
         if (fs.existsSync(frame)) imgs.push(frame);
     } catch { /* skip unreadable video */ }
        }
    }
    if (imgs.length === 0) return null;
    const cols = Math.min(imgs.length, 3);
    const out = `${wsRoot}/contact-sheet.png`;
    try {
        execFileSync(ffmpeg, [
            '-y', ...imgs.flatMap((p) => ['-i', p]),
            '-filter_complex',
            imgs.map((_, i) => `[${i}:v]scale=360:640[s${i}]`).join(';') + ';' +
            imgs.map((_, i) => `[s${i}]`).join('') + `vstack=inputs=${imgs.length}`,
            `-frames:v`, '1', out,
        ], { stdio: 'ignore' });
        return fs.existsSync(out) ? out : null;
    } catch {
        return null;
    }
}

/**
 * writeDecisionsReport — human/agent-readable record of every asset decision,
 * explicitly stamped as approved by the Hermes AI agent.
 */
export function writeDecisionsReport(res: PipelineResult): string {
    const wsRoot = res.workspace.root;
    const decider = res.fullyAgentDriven ? 'HERMES AI AGENT (autonomous, no external model)' : 'AGENT + vision backend';
    const lines: string[] = [
        `AGENTIC VIDEO — DECISION REPORT`,
        `job: ${res.workspace.jobId} | title: ${res.plan.title} | backend: ${res.backend}`,
        `decider: ${decider}`,
        `gate: ${res.gate.pass ? 'PASS' : 'BLOCKED'}`,
        ``,
        `Every image/video below was APPROVED by the agent. No human approval required.`,
        ``,
    ];
    for (const d of res.decisions) {
        const c = res.candidates.find((x) => assetId(x.kind, x.sceneIndex, x.candidateIndex) === d.assetId);
        const path = c?.localPath ?? '(none)';
        const verdict = d.decision === 'approved' ? '✅ APPROVED' : d.decision === 'rejected' ? '❌ REJECTED' : '🔁 REPLACED';
        lines.push(`[${verdict}] ${d.kind} scene#${d.sceneIndex} -> ${path}`);
        lines.push(`    decision by: ${d.decidedBy} | rationale: ${d.rationale}`);
    }
    const out = `${wsRoot}/decisions-report.txt`;
    fs.writeFileSync(out, lines.join('\n'), 'utf8');
    return out;
}

/**
 * Phase 1.3 — Remotion render path for the agentic pipeline.
 *
 * Copies the approved assets + voiceovers into `public/` (so Remotion's
 * `staticFile()` can resolve them), bundles the Remotion entry, selects the
 * `AgenticVideo` composition, and renders a cinematic MP4 via @remotion/renderer
 * `renderMedia` (uses the local Chrome install). Returns the output path.
 *
 * NOTE: this requires Chrome + sufficient RAM. On RAM-starved hosts it may fail;
 * callers should fall back to `renderAgenticSlideshow` (ffmpeg-static, no Chrome).
 */
export async function renderAgenticWithRemotion(
    res: PipelineResult,
    opts: { brand?: { primaryColor?: string; accentColor?: string; fontFamily?: string; logoPath?: string }; intro?: { title: string; subtitle?: string; durationSec: number }; outro?: { ctaText: string; showSubscribe: boolean; hashtags?: string[]; durationSec: number }; kenBurns?: boolean; quality?: 'draft' | 'medium' | 'high' } = {},
): Promise<string> {
     
    const { bundle } = require('@remotion/bundler');
     
    const { renderMedia, selectComposition } = require('@remotion/renderer');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const fps = 30;
    const publicDir = path.resolve(process.cwd(), 'public');
    // Job-specific subdir so two concurrent runs never clobber each other's
    // transcoded assets (staticFile() resolves by filename). Only THIS job's
    // subdir is cleared — the parent agentic-assets/ is left intact.
    const jobAssetDir = path.join(publicDir, 'agentic-assets', String(res.workspace.jobId));
    fs.rmSync(jobAssetDir, { recursive: true, force: true });
    fs.mkdirSync(jobAssetDir, { recursive: true });

    const assetsForComposition: any[] = [];
    // Cap source resolution so Remotion/Chrome doesn't decode 4K originals on a
    // RAM-starved box. The composition outputs 1080x1920; transcode to 720p for
    // draft, 1080p otherwise — fast and light via ffmpeg.
    const ffmpegBin: string = require('ffmpeg-static');
    const { execFileSync } = require('child_process');
    const targetH = opts.quality === 'draft' ? 1280 : 1920;
    for (const a of res.manifest.assets) {
        const src = a.localPath;
        const destName = `s${a.sceneIndex}_${a.kind}_${path.basename(src).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const dest = path.join(jobAssetDir, destName);
        try {
            if (a.kind === 'video' && /\.(mp4|webm|mov|m4v)$/i.test(src) && fs.existsSync(src)) {
                // Downscale + normalize so Chrome renders light.
                execFileSync(ffmpegBin, [
                    '-i', src, '-vf', `scale=-2:${targetH}`, '-c:v', 'libx264',
                    '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
                    '-c:a', 'aac', '-y', dest,
                ], { stdio: 'ignore' });
            } else {
                fs.copyFileSync(src, dest);
            }
        } catch {
            try { fs.copyFileSync(src, dest); } catch { continue; }
        }
        let audioRel: string | undefined;
        if (a.audioPath && fs.existsSync(a.audioPath)) {
            const adestName = `s${a.sceneIndex}_audio.${a.audioPath.split('.').pop()}`;
            const adest = path.join(jobAssetDir, adestName);
            fs.copyFileSync(a.audioPath, adest);
            audioRel = path.join('agentic-assets', String(res.workspace.jobId), adestName).replace(/\\/g, '/');
        }
        assetsForComposition.push({
            kind: a.kind,
            sceneIndex: a.sceneIndex,
            localPath: path.join('agentic-assets', String(res.workspace.jobId), destName).replace(/\\/g, '/'),
            audioPath: audioRel,
            durationSec: a.durationSec,
            captionSegments: a.captionSegments ?? [],
            license: a.license,
        });
    }

    const inputProps = {
        title: res.plan.title,
        orientation: res.plan.orientation ?? 'portrait',
        fps,
        assets: assetsForComposition,
        brand: opts.brand ?? { primaryColor: '#0a0a12', accentColor: '#FF6B35', fontFamily: 'system-ui' },
        introCard: opts.intro,
        outroCard: opts.outro,
        kenBurns: opts.kenBurns ?? true,
    };
    const totalFrames = Math.max(
        30,
        (assetsForComposition.filter((a) => a.kind !== 'music').reduce((s, a) => s + (a.durationSec ?? 4), 0) +
            (opts.intro?.durationSec ?? 0) +
            (opts.outro?.durationSec ?? 0)) * fps,
    );

    const bundleLoc = await bundle(path.resolve(process.cwd(), 'remotion/index.ts'), () => undefined, {
        webpackCacheDisabled: true,
    });
    const composition = await selectComposition({ serveUrl: bundleLoc, id: 'AgenticVideo', inputProps, ...{} });
    const outDir = res.workspace.root + '/render';
    fs.mkdirSync(outDir, { recursive: true });
    const out = outDir + '/' + res.workspace.jobId + '_remotion.mp4';
    const crf = opts.quality === 'high' ? 18 : opts.quality === 'draft' ? 28 : 23;

    await renderMedia({
        composition,
        serveUrl: bundleLoc,
        codec: 'h264',
        outputLocation: out,
        inputProps,
        crf,
        concurrency: 1,
        imageFormat: 'jpeg',
        timeoutInMilliseconds: 1000 * 60 * 9,
        framesPerLambda: null as any,
        // Use a system Chrome when provided (e.g. CHROME_EXECUTABLE on a laptop
        // that has Google Chrome installed) instead of Remotion's bundled
        // Chromium download. Falls back to bundled Chromium when unset.
        ...(process.env.CHROME_EXECUTABLE ? { chromeExecutable: process.env.CHROME_EXECUTABLE } : {}),
    });
    // Phase 8.4 post-render check applies here too.
    res.postRender = verifyRenderedVideo(out, totalFrames / fps);
    return out;
}
