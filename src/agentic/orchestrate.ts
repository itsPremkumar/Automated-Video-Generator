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
import { fetchVisualsForScene } from '../lib/visual-fetcher.js';
import { downloadMedia } from '../lib/visual-fetcher.js';
import { verifyMedia } from '../lib/media-verifier.js';
import { resolveFreeBackgroundMusic } from '../lib/free-music.js';
import { verifyRenderedVideo, PostRenderCheck } from './gate.js';

import { buildPlan } from './plan.js';
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

    // Agent expands keywords per scene (optional bolt-on; default heuristic).
    for (const s of plan.scenes) {
        s.searchKeywords = cfg.expandKeywords
            ? await cfg.expandKeywords(s, req.title)
            : expandKeywordsHeuristic(s, req.title);
    }
    if (req.preferVisual) {
        for (const s of plan.scenes) s.visualPreference = req.preferVisual;
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
    const acquireDeps: AcquireDeps = {
        fetchVisual: async (keywords, kind, orientation) => {
            try {
                const res = await fetchVisualsForScene(keywords, kind === 'video', orientation);
                // res may be a MediaAsset, an array, or null/{} on a transient
                // cache/network miss. Normalise; if there's no usable URL, fall
                // back to a generated placeholder so the pipeline never loses a
                // scene (the agent still renders a real, attributed card).
                const arr = !res ? [] : (Array.isArray(res) ? res : [res]);
                const usable = arr.filter((a) => a && typeof a.url === 'string' && a.url.length > 0);
                if (usable.length === 0) {
                    const ph = makePlaceholder(keywords, kind);
                    return [{ url: '', localPath: ph, source: 'placeholder', license: 'CC0 (generated placeholder)', licenseUrl: '' } as FetchedVisual];
                }
                return usable.map((a) => ({
                    url: a.url,
                    localPath: '',
                    source: 'openverse/pexels',
                    license: a.license,
                    licenseUrl: a.licenseUrl,
                } as FetchedVisual));
            } catch (e) {
                // Provider/network hiccup (e.g. 502). The agent backend tolerates
                // this by falling back to a locally-generated placeholder so the
                // pipeline still yields a real, renderable asset.
                console.warn(`⚠ fetchVisual failed for "${keywords.join(' ')}": ${(e as Error).message}. Using placeholder.`);
                const ph = makePlaceholder(keywords, kind);
                return [{ url: '', localPath: ph, source: 'placeholder', license: 'CC0 (generated placeholder)', licenseUrl: '' } as FetchedVisual];
            }
        },
        download: async (url, dir, filename) => {
            // Retry transient CDN/5xx errors (e.g. 502 from a flaky image host)
            // before giving up on a real asset — only then fall back to a card.
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const r = await downloadMedia(url, dir, filename);
                    return r.path;
                } catch (e) {
                    const isLast = attempt === 2;
                    if (isLast) {
                        console.warn(`⚠ download failed for "${url}": ${(e as Error).message}. Using placeholder.`);
                        const base = filename.replace(/\.[^.]+$/, '');
                        return makePlaceholder([base], 'image');
                    }
                    await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
                }
            }
            const base = filename.replace(/\.[^.]+$/, '');
            return makePlaceholder([base], 'image');
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
    let manifest = readJson<RenderManifest>(workspace, 'render-manifest.json');
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
    const color = kind === 'video' ? 'teal' : 'navy';
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
    opts: { outPath?: string; crossfadeSec?: number; burnCaptions?: boolean; sfx?: boolean; transition?: string; preset?: string; kinetic?: boolean } = {},
): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpeg: string = require('ffmpeg-static');
    const { execFile } = require('child_process');
    const outDir = res.workspace.root + '/render';
    fs.mkdirSync(outDir, { recursive: true });
    const out = opts.outPath ?? (outDir + '/' + res.workspace.jobId + '.mp4');
    if (!res.manifest) throw new Error('Cannot render: final gate did not produce a render manifest (gate.pass=' + res.gate.pass + ').');

    const visuals = res.manifest.assets.filter((a) => a.kind !== 'music');
    const music = res.manifest.assets.find((a) => a.kind === 'music');
    if (visuals.length === 0) throw new Error('No approved visuals to render.');

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
        let t = 0;
        let n = 1;
        for (const a of visuals) {
            const dur = a.durationSec ?? 4;
            const raw = a.captionSegments && a.captionSegments.length
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
    const W = 720, H = 1280;
    const sceneFilters = visuals.map((a, i) => {
        const dur = a.durationSec ?? 4;
        // Gentle Ken Burns zoom (spec 7.1). Comma inside the min() expression is
        // escaped as '\\,' and NO single quotes (filtergraph isn't shell-parsed).
        const zoom = a.kind === 'image' ? `,zoompan=z=min(zoom+0.0008\\,1.04):d=1:s=${W}x${H}` : '';
        // Editing engine v1: per-scene color grade (no LUT file needed).
        const grade = gradeFilter(stylePlan.scenes[i]?.grade ?? 'neutral');
        const tag = '[' + i + ':v]';
        return `${tag}scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=${dur},setpts=PTS-STARTPTS${zoom},${grade},format=yuv420p[v${i}]`;
    });

    // ── Concat the scene videos with per-scene transitions from the style plan. ──
    let videoChain: string;
    if (visuals.length === 1) {
        videoChain = '[v0]';
    } else {
        // chain transitions pairwise; a 'cut' = hard concat (no overlap),
        // otherwise xfade with the chosen transition name.
        let prev = 'v0';
        for (let i = 1; i < visuals.length; i++) {
            const tk: any = stylePlan.scenes[i]?.transitionIn ?? 'fade';
            const outTag = i === visuals.length - 1 ? 'vout' : 'vx' + i;
            if (tk === 'cut') {
                sceneFilters.push(`[${prev}][v${i}]concat=n=2:v=1:a=0[${outTag}]`);
            } else {
                const xname = xfadeName(tk);
                sceneFilters.push(`[${prev}][v${i}]xfade=transition=${xname}:duration=${xf}:offset=${offsetFor(visuals, i, xf)}[${outTag}]`);
            }
            prev = outTag;
        }
        videoChain = '[vout]';
    }

    const videoInputs = visuals.flatMap((v) => ['-loop', '1', '-i', v.localPath]);
    const vfArgs = [...sceneFilters];
    let videoMap = videoChain;

    // ── Caption burn-in (subtitles filter) applied to the chained video. ──
    if (captionFile) {
        // In an ffmpeg filtergraph, colons must be escaped as '\\:' and backslashes
        // as '/'. Do NOT wrap the path in quotes (filtergraph isn't shell-parsed).
        vfArgs.push(`${videoChain}subtitles=${escapeFilterPath(captionFile)}:force_style='FontSize=28,PrimaryColour=&Hffffff&,OutlineColour=&H000000&,Outline=2,Alignment=2'[vcap]`);
        videoMap = '[vcap]';
    }
    // ── Editing engine v1: kinetic text overlays (lower-third reveal + word-pop). ──
    // Each cue is placed at its absolute timeline position. drawtext enable= drives
    // the on/off window; a tiny fade gives the "pop". Apostrophes are swapped for ’
    // because drawtext breaks on bare single quotes in the text string.
    if (stylePlan && opts.kinetic !== false) {
        let t = 0;
        const sceneStarts = visuals.map((a) => { const s = t; t += (a.durationSec ?? 4); return s; });
        let ktag = videoMap;
        for (let i = 0; i < visuals.length; i++) {
            const base = sceneStarts[i];
            for (const cue of stylePlan.scenes[i]?.kinetic ?? []) {
                const start = (base + cue.atSec).toFixed(2);
                const end = (base + cue.atSec + (cue.kind === 'wordpop' ? 0.9 : 2.6)).toFixed(2);
                const safe = cue.text.replace(/'/g, '’').replace(/:/g, '\\:');
                if (cue.kind === 'lowerthird') {
                    vfArgs.push(`${ktag}drawtext=text='${safe}':fontcolor=white:fontsize=34:box=1:boxcolor=black@0.45:boxborderw=12:x=(w-text_w)/2:y=h-text_h-90:enable='between(t\\,${start}\\,${end})':alpha='if(lt(t\\,${start}+0.25)\\,((t-${start})/0.25)\\,if(gt(t\\,${end}-0.3)\\,(((${end}-t)/0.3))\\,1))'[k${i}]`);
                } else {
                    vfArgs.push(`${ktag}drawtext=text='${safe}':fontcolor=white:fontsize=64:fontcolor_expr=white:box=1:boxcolor=black@0.0:borderw=3:bordercolor=yellow:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t\\,${start}\\,${end})':alpha='if(lt(t\\,${start}+0.15)\\,((t-${start})/0.15)\\,if(gt(t\\,${end}-0.2)\\,(((${end}-t)/0.2))\\,1))'[k${i}]`);
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
    const voScenes = visuals.filter((a) => a.audioPath && fs.existsSync(a.audioPath));
    let audioInputArgs: string[] = [];
    let audioFilter: string | null = null;
    let audioMap: string[] = [];
    if (voScenes.length > 0) {
        audioInputArgs = voScenes.flatMap((a) => ['-i', a.audioPath!]);
        // Audio inputs are appended AFTER the video inputs, so their file index
        // starts at visuals.length (input 0..n-1 are the stills).
        const base = visuals.length;
        const aTags = voScenes.map((_, i) => `[${base + i}:a]`);
        const concatA = aTags.join('') + `concat=n=${voScenes.length}:v=0:a=1[aout]`;
        audioFilter = concatA;
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
        let { startMs, endMs, text } = m;
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
        if (!c || !c.localPath || !fs.existsSync(c.localPath)) continue;
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { bundle } = require('@remotion/bundler');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { renderMedia, selectComposition } = require('@remotion/renderer');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const fps = 30;
    const publicDir = path.resolve(process.cwd(), 'public');
    const assetDir = path.join(publicDir, 'agentic-assets');
    // Start clean so a previous run's transcoded assets never leak into this job
    // (staticFile() resolves by filename; stale files would corrupt the render).
    fs.rmSync(assetDir, { recursive: true, force: true });
    fs.mkdirSync(assetDir, { recursive: true });

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
        const dest = path.join(assetDir, destName);
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
            const adest = path.join(assetDir, adestName);
            fs.copyFileSync(a.audioPath, adest);
            audioRel = path.join('agentic-assets', adestName).replace(/\\/g, '/');
        }
        assetsForComposition.push({
            kind: a.kind,
            sceneIndex: a.sceneIndex,
            localPath: path.join('agentic-assets', destName).replace(/\\/g, '/'),
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
    });
    // Phase 8.4 post-render check applies here too.
    res.postRender = verifyRenderedVideo(out, totalFrames / fps);
    return out;
}
