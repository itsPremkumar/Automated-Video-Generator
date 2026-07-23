import * as fs from 'fs';
import * as path from 'path';
import { parseScript } from '../../lib/script-parser.js';
import { fetchVisualsForScene, searchImages } from '../../lib/visual-fetcher.js';
import { downloadMedia } from '../../lib/visual-fetcher.js';
import { verifyMedia } from '../../lib/media-verifier.js';
import { resolveFreeBackgroundMusic } from '../../lib/free-music.js';
import { inputAssetPath, inputBgmPath, inputVoiceoverPath } from '../../lib/path-safety.js';
import { LANGUAGE_DEFAULTS } from '../../lib/voice-data.js';
import { buildPlan, applyProEdits } from '../pipeline/plan.js';
import { acquireAssets, AcquireDeps, FetchedVisual } from '../pipeline/acquire.js';
import { verifyAll, VerifyDeps } from '../pipeline/verify.js';
import { runGateway, GatewayDeps } from '../pipeline/gateway.js';
import { runFinalGate } from '../pipeline/gate.js';
import { AgenticWorkspace, readJson, writeJson, pruneWorkspaces } from '../management/workspace.js';
import { archiveJob } from '../delivery/archive.js';
import { openReview } from '../delivery/revision.js';
import { createPluginRegistry, registerAllPlugins, getPluginRegistry } from '../plugins/index.js';
import { PluginContext } from '../plugins/core/types.js';
import { generateAgenticVoiceovers } from '../media/tts.js';
import { createJob, updateJob, persistJob } from '../management/job.js';
import { AssetCandidate, AssetDecision, Plan, RenderManifest, assetId } from '../types.js';
import { AgentBackendConfig, AgenticBackend, expandKeywordsHeuristic, writeScriptHeuristic } from '../ai/agent.js';
import { AgentBrain, hasModel, envOpts } from '../ai/brain.js';
import { resolveBridge, type LlmBridge, type DriverLlmCallback } from '../ai/bridge.js';
import { sourceFromUrl } from './source.js';
import { withTimeout, estimateAudioDurationSafe, makePlaceholder, normalizeAudio, runFfmpeg } from './ffmpeg.js';
import { makeContactSheet, writeDecisionsReport } from './artifacts.js';
import type { PipelineRequest, PipelineResult, PipelineProgress } from './types.js';
import { logInfo, logWarn, logError } from '../../shared/logging/runtime-logging.js';

export type { PipelineRequest, PipelineResult, PipelineProgress };

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
        // Control-surface extension — reached from the script JSON
        aiVerify: req.aiVerify,
        brain: req.brain,
    };
    const jobId = req.jobId ?? `job_${Date.now()}`;
    try {
        const pluginCfgPath = path.join(process.cwd(), 'agentic-plugins.config.json');
        let pluginCfg: any = { plugins: [] };
        try {
            if (fs.existsSync(pluginCfgPath)) pluginCfg = JSON.parse(fs.readFileSync(pluginCfgPath, 'utf-8'));
        } catch { /* defaults */ }
        const pctx = new PluginContext({
            jobId,
            workspaceRoot: `./workspace/jobs/${jobId}`,
            config: pluginCfg,
        });
        const preg = await createPluginRegistry(pctx);
        registerAllPlugins(preg, pluginCfg);
    } catch (e) {
        console.warn(`⚠ plugin registry init skipped: ${(e as Error)?.message ?? e}`);
    }
    const sharedImagePool: { url: string }[] = [];
    sharedImagePool.length = 0;

    pruneWorkspaces(req.pruneWorkspaces ?? Number(process.env.AGENTIC_KEEP_WORKSPACES ?? 2));

    const brainOpts = cfg.brain ? { maxCalls: cfg.brain.maxCalls, maxFails: cfg.brain.maxFails } : undefined;
    const driverLLM: DriverLlmCallback | undefined = req.driverLLM;
    const bridge: LlmBridge = resolveBridge({
        hasModelKeys: hasModel(brainOpts ?? envOpts()),
        driverLLM,
        modelOpts: brainOpts,
    });
    const brain = new AgentBrain(brainOpts);

    const script =
        req.script ??                                          // ← custom script with [Visual: ...] tags
        (cfg.writeScript ? await cfg.writeScript(req.topic, req.title) : null) ??
        (
            await bridge.completeJSON<{ script: string }>(
                'You are a short-form video scriptwriter. Write a tight, natural, engaging script with a hook, build, and payoff. 3-5 short sentences. No hashtags, no markup.',
                `Topic: ${req.topic}\nTitle: ${req.title}`,
                '{"script":"..."}',
            )
        )?.script ??
        writeScriptHeuristic(req.topic, req.title);

    // Language → voice resolution (same as legacy pipeline)
    const resolvedVoice =
        req.language && !req.voice
            ? LANGUAGE_DEFAULTS[req.language.toLowerCase().trim()]
            : req.voice;

    const plan = await buildPlan(
        script,
        {
            jobId,
            title: req.title,
            orientation: req.orientation ?? 'portrait',
            voice: resolvedVoice ?? 'en-US-JennyNeural',
            musicQuery: req.musicQuery,
        },
        parseScript,
    );

    // Apply musicVolume to env for render step (osom will pick it up)
    if (req.musicVolume != null) {
        process.env.AUDIO_FULL_LEVEL = String(req.musicVolume);
    }

    await applyProEdits(plan, {
        hookFirst: req.hookFirst ?? true,
        variablePacing: req.variablePacing ?? true,
        brain,
    });

    for (const s of plan.scenes) {
        const base = s.voiceoverText || s.searchKeywords.join(' ');
        s.searchKeywords = cfg.expandKeywords
            ? await cfg.expandKeywords(s, req.title)
            : ((await brain.expandKeywords(base, req.title)) ?? expandKeywordsHeuristic(s, req.title));
    }
    if (req.preferVisual) {
        for (const s of plan.scenes) s.visualPreference = req.preferVisual;
    }

    const LOCAL_MEDIA_RE = /\.(jpg|jpeg|png|webp|gif|mp4|mov|webm|m4v)$/i;
    if (req.localAssets && req.localAssets.length > 0) {
        // Only bind to scenes WITHOUT an existing localAsset (set by parseScript from [Visual: ...] tags)
        let li = 0;
        for (const s of plan.scenes) {
            if (!s.localAsset) {
                s.localAsset = req.localAssets[li % req.localAssets.length];
                li++;
            }
        }
        emit({ stage: 'plan', percent: 100, message: `Bound ${req.localAssets.length} local asset(s) to ${plan.scenes.length} scenes` });
    } else {
        try {
            const assetsDir = inputAssetPath();
            if (fs.existsSync(assetsDir)) {
                const files = fs.readdirSync(assetsDir).filter((f) => LOCAL_MEDIA_RE.test(f));
                if (files.length > 0) {
                    req.localAssets = files.sort();
                    // Only bind to scenes WITHOUT an existing localAsset
                    let li = 0;
                    for (const s of plan.scenes) {
                        if (!s.localAsset) {
                            s.localAsset = req.localAssets[li % req.localAssets.length];
                            li++;
                        }
                    }
                    emit({ stage: 'plan', percent: 100, message: `Auto-detected ${files.length} local asset(s) from input/visuals/ → bound to ${plan.scenes.length} scenes` });
                }
            }
        } catch { /* input/visuals/ may not exist or be inaccessible; skip silently */ }
    }
    if (req.videoClips && req.videoClips.length > 0) {
        plan.scenes.forEach((s, i) => {
            const clip = req.videoClips![i % req.videoClips!.length];
            if (clip) {
                s.localAsset = path.basename(clip);
                s.visualPreference = 'video';
            }
        });
        emit({ stage: 'plan', percent: 100, message: `Bound ${req.videoClips.length} video clip(s) to ${plan.scenes.length} scenes` });
    }
    if (req.personalAudio && req.personalAudio.length > 0) {
        plan.scenes.forEach((s, i) => {
            const a = req.personalAudio![i % req.personalAudio!.length];
            if (a) s.personalAudio = path.basename(a);
        });
        emit({ stage: 'plan', percent: 100, message: `Bound ${req.personalAudio.length} personal audio track(s)` });
    }

    if (req.dryRun) {
        emit({ stage: 'plan', percent: 100, message: `DRY RUN — ${plan.scenes.length} scenes, no assets fetched` });
        return {
            backend,
            plan,
            workspace: {
                jobId: 'dry-run',
                root: '', assetsDir: '', imagesDir: '', videosDir: '', musicDir: '', verificationDir: '',
            } as AgenticWorkspace,
            candidates: [],
            decisions: [],
            gate: { pass: false, checks: [] },
            manifest: null as any,
            voiceovers: null,
            fullyAgentDriven: backend === 'agent' && !cfg.visionVerify,
        };
    }

    emit({ stage: 'plan', percent: 100, message: `Plan ready (${plan.scenes.length} scenes)` });

    const STOP = new Set([
        'a', 'an', 'the', 'of', 'for', 'to', 'and', 'or', 'in', 'on', 'with', 'about',
        'facts', 'fact', 'benefits', 'benefit', 'how', 'what', 'why', 'tips', 'ways', 'things',
        '5', '3', '10', 'top', 'best', 'amazing', 'fascinating', 'interesting',
        'daily', 'changed', 'change', 'vs',
    ]);
    const topicNoun =
        ((req.topic || plan.title || 'video') as string)
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w && !STOP.has(w.replace(/[^a-z]/g, '')))
            .join(' ') || 'video';
    const preferVideo = plan.scenes.some((s) => s.visualPreference === 'video');
    const getImagePool = async () => {
        if ((req.localAssets && req.localAssets.length > 0) || (req.videoClips && req.videoClips.length > 0)) {
            return sharedImagePool;
        }
        if (sharedImagePool.length > 0) return sharedImagePool;
        const DEAD_HOSTS = /flickr\.com|staticflickr\.com|live\.staticflickr/i;
        const seen = new Set<string>();
        const add = (url?: string) => {
            if (url && !DEAD_HOSTS.test(url) && !seen.has(url)) {
                seen.add(url);
                sharedImagePool.push({ url });
            }
        };
        const variants = [topicNoun, `${topicNoun} photo`, (req.title || '').trim(), `person ${topicNoun}`]
            .map((s) => s.trim())
            .filter(Boolean);
        for (const q of variants) {
            if (preferVideo) {
                try {
                    const r = await fetchVisualsForScene([q], true, plan.orientation);
                    if (r) add(Array.isArray(r) ? r[0]?.url : r.url);
                } catch { /* next */ }
                try {
                    (await searchImages(q, 12, 2, plan.orientation, 1)).forEach((p) => add(p.url));
                } catch { /* next */ }
                try {
                    const r = await fetchVisualsForScene([q], false, plan.orientation);
                    if (r) add(Array.isArray(r) ? r[0]?.url : r.url);
                } catch { /* next */ }
            } else {
                try {
                    (await searchImages(q, 12, 2, plan.orientation, 1)).forEach((p) => add(p.url));
                } catch { /* next */ }
                try {
                    const r = await fetchVisualsForScene([q], false, plan.orientation);
                    if (r) add(Array.isArray(r) ? r[0]?.url : r.url);
                } catch { /* next */ }
            }
            if (sharedImagePool.length >= 12) break;
        }
        if (sharedImagePool.length === 0) {
            try {
                const res = await withTimeout(
                    fetchVisualsForScene([topicNoun], preferVideo, plan.orientation),
                    12000,
                    `fetchVisual[topicNoun]`,
                );
                if (res) add(Array.isArray(res) ? res[0]?.url : res.url);
            } catch { /* ignore */ }
        }
        return sharedImagePool;
    };

    const acquireDeps: AcquireDeps = {
        fetchVisual: async (keywords, kind, orientation, sceneIndex = 0) => {
            // Phase 1: targeted Pexels search with per-scene resultIndex
            const bySpecificity = [...keywords].sort((a, b) => b.length - a.length);
            const ladder = [bySpecificity, keywords];
            if (keywords.length > 1) ladder.push([keywords[0]]);
            ladder.push([topicNoun || 'nature', 'city', 'technology'].slice(0, 1));
            const seen = new Set<string>();
            for (const raw of ladder) {
                const q = raw.filter(Boolean);
                const key = q.join(' ');
                if (seen.has(key)) continue;
                seen.add(key);
                try {
                    const resultIndex = sceneIndex;
                    const res = await withTimeout(
                        fetchVisualsForScene(q, kind === 'video', orientation, undefined, resultIndex),
                        12000,
                        `fetchVisual[${q.join(' ')}]`,
                    );
                    const arr = !res ? [] : Array.isArray(res) ? res : [res];
                    const DEAD_HOSTS = /flickr\.com|staticflickr\.com|live\.staticflickr/i;
                    const usable = arr.filter(
                        (a) => a && typeof a.url === 'string' && a.url.length > 0 && !DEAD_HOSTS.test(a.url),
                    );
                    if (usable.length > 0) {
                        return usable.map(
                            (a) =>
                                ({
                                    url: a.url,
                                    localPath: '',
                                    source: 'openverse/pexels',
                                    license: a.license,
                                    licenseUrl: a.licenseUrl,
                                }) as FetchedVisual,
                        );
                    }
                } catch (e) {
                    console.warn(`⚠ fetchVisual failed for "${q.join(' ')}": ${(e as Error).message}`);
                }
            }

            // Phase 2: fall back to the image pool (built earlier from topic search)
            const pool = await getImagePool();
            if (pool.length > 0) {
                const pick = pool[sceneIndex % pool.length];
                const DEAD_HOSTS = /flickr\.com|staticflickr\.com|live\.staticflickr/i;
                if (pick && pick.url && !DEAD_HOSTS.test(pick.url)) {
                    const source = sourceFromUrl(pick.url);
                    return [
                        {
                            url: pick.url,
                            localPath: '',
                            source,
                            license: undefined,
                            licenseUrl: undefined,
                            width: 0,
                            height: 0,
                        },
                    ];
                }
            }
            const ph = makePlaceholder(keywords, kind);
            return [
                {
                    url: '',
                    localPath: ph,
                    source: 'placeholder',
                    license: 'CC0 (generated placeholder)',
                    licenseUrl: '',
                } as FetchedVisual,
            ];
        },
        download: async (url, dir, filename) => {
            const useDefaultVisual = (): string => {
                const local = require('path').join(
                    dir,
                    filename.replace(/(\.[^.]+)?$/, path.extname(req.defaultVisual || '.png')),
                );
                try {
                    const src = inputAssetPath(req.defaultVisual!);
                    if (fs.existsSync(src)) {
                        fs.mkdirSync(dir, { recursive: true });
                        fs.copyFileSync(src, local);
                        return local;
                    }
                } catch { /* ignore */ }
                return '';
            };
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const r = await downloadMedia(url, dir, filename);
                    return r.path;
                } catch (e) {
                    const isLast = attempt === 2;
                    if (isLast) {
                        console.warn(`⚠ download failed for "${url}": ${(e as Error).message}. Using placeholder card.`);
                        const local = require('path').join(dir, filename.replace(/(\.[^.]+)?$/, '.png'));
                        const def = req.defaultVisual ? useDefaultVisual() : '';
                        if (!def) {
                            const ph = makePlaceholder([filename.replace(/\.[^.]+$/, '')], 'image');
                            try {
                                require('fs').copyFileSync(ph, local);
                            } catch (e) {
                                console.warn(`⚠ placeholder copy failed for ${filename}: ${(e as Error)?.message}`);
                            }
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
                try {
                    require('fs').copyFileSync(ph, local);
                } catch (e) {
                    console.warn(`⚠ placeholder copy failed for ${filename}: ${(e as Error)?.message}`);
                }
            }
            return def || local;
        },
        fetchMusic: async (query, count) => {
            // backgroundMusic override: use local file instead of searching
            if (req.backgroundMusic) {
                const bgmPath = inputAssetPath(req.backgroundMusic);
                if (fs.existsSync(bgmPath)) {
                    logInfo(`  🎵 Using custom background music: ${req.backgroundMusic}`);
                    const normalized = normalizeAudio(bgmPath);
                    const finalPath = normalized && fs.existsSync(normalized) ? normalized : bgmPath;
                    if (finalPath) {
                        return [{
                            url: '',
                            localPath: finalPath,
                            source: 'local',
                            license: 'CC-BY (user provided)',
                            licenseUrl: '',
                        }];
                    }
                } else {
                    console.warn(`  ⚠ backgroundMusic file not found: ${req.backgroundMusic} (in input/visuals/) — falling back to stock music`);
                }
            }
            const tracks = [];
            for (let i = 0; i < count; i++) {
                const m = await resolveFreeBackgroundMusic({ query, enabled: true });
                let localPath = m?.localPath && fs.existsSync(m.localPath) ? m.localPath : '';
                if (!localPath) {
                    const fallback = [inputBgmPath('twenty_minutes.mp3'), inputBgmPath('two_minutes.mp3')].find((p) =>
                        fs.existsSync(p),
                    );
                    localPath = fallback ?? makePlaceholder([query], 'music');
                }
                const normalized = normalizeAudio(localPath);
                const finalPath = normalized && fs.existsSync(normalized) ? normalized : localPath;
                if (finalPath)
                    tracks.push({
                        url: '',
                        localPath: finalPath,
                        source: m?.track.provider ?? 'local',
                        license: m?.track.license ?? 'CC-BY (assumed royalty-free)',
                        licenseUrl: m?.track.licenseUrl ?? '',
                    } as FetchedVisual);
            }
            return tracks;
        },
    };
    if (cfg.aiVerify?.enabled) {
        acquireDeps.cfg = cfg as any;
        acquireDeps.bridge = bridge;
    }
    const { workspace, candidates } = await acquireAssets(plan, acquireDeps, req.candidatesPerAsset ?? 2);
    emit({ stage: 'acquire', percent: 100, message: `Acquired ${candidates.length} candidates` });
    writeJson(workspace, 'plan.json', plan);
    const jobRec = createJob(jobId, workspace, { topic: req.topic, title: req.title, backend, state: 'processing' });

    const vision = cfg.visionVerify
        ? cfg.visionVerify
        : backend === 'vision'
          ? (p: string, kw: string[]) => verifyMedia(p, kw)
          : async () => ({
                passes: true,
                confidence: 6,
                reason: 'agent backend: signal-only; visual relevance not AI-scored',
            });
    const verifyDeps: VerifyDeps = {
        verifyImage: (p, kw) => vision(p, kw),
        verifyVideo: (p, kw) => vision(p, kw),
    };

    const gatewayDeps: GatewayDeps = {
        ...acquireDeps,
        ...verifyDeps,
        decide: async (c, v) => {
            const decisions = readJson<AssetDecision[]>(workspace, 'approval-manifest.json') ?? [];
            const approvedInScene = decisions.filter(
                (d) => d.sceneIndex === c.sceneIndex && d.decision === 'approved',
            ).length;
            const { agentDecide } = await import('../ai/agent.js');
            const result = agentDecide({ candidate: c, verification: v as any, approvedInScene });
            emit({
                stage: 'decide',
                percent: 50,
                message: `[s${c.sceneIndex} c${c.candidateIndex}] ${result.decision}`,
                sceneIndex: c.sceneIndex,
                candidateIndex: c.candidateIndex,
            });
            return result;
        },
    };

    emit({ stage: 'verify', percent: 100, message: 'Verification complete' });
    const { decisions } = await runGateway(plan, candidates, gatewayDeps);
    emit({
        stage: 'decide',
        percent: 100,
        message: `${decisions.filter((d) => d.decision === 'approved').length} assets approved`,
    });
    const manifest = readJson<RenderManifest>(workspace, 'render-manifest.json');
    const gate = runFinalGate(plan, candidates, decisions, manifest);
    emit({ stage: 'gate', percent: 100, message: gate.pass ? 'GATE PASS' : 'GATE FAIL' });

    let voiceovers: import('../media/tts.js').VoiceoverResult | null = null;
    if (gate.pass && manifest) {
        // PRIMARY: native self-driving voice stage (src/speech backend).
        // It auto-provisions a Kokoro preset profile, preloads the engine,
        // generates every scene, then tears the backend down (RAM-aware).
        try {
            const { runVoiceStage } = await import('../media/voice-controller.js');
            const res = await runVoiceStage(plan, workspace, req.voice, (percent, message) => {
                emit({ stage: 'voiceover', percent, message });
            });
            // Normalize into the shape the manifest mapping expects.
            voiceovers = {
                scenes: res.voices.map((v) => ({
                    sceneIndex: v.sceneIndex,
                    audioPath: v.audioPath,
                    durationSec: v.durationSec,
                    captionSegments: [],
                })),
                voiceoverDriven: res.voiceoverDriven,
                sidecars: [],
                fallbackUsed: res.fallbackUsed,
            };
            emit({
                stage: 'voiceover',
                percent: 100,
                message: `Voiceover ${res.voiceoverDriven ? 'generated (speech backend)' : 'partial via speech backend'}`,
            });
        } catch (e: any) {
            // FALLBACK: Edge-TTS / tone path (never blocks the pipeline).
            console.warn(`⚠ speech backend voice stage failed ("${e?.message}"); falling back to Edge-TTS`);
            voiceovers = await generateAgenticVoiceovers(plan, workspace, req.voice);
            emit({
                stage: 'voiceover',
                percent: 100,
                message: `Voiceover ${voiceovers.voiceoverDriven ? 'generated (Edge-TTS fallback)' : 'fallback tones'}`,
            });
        }
        const voByScene = new Map(voiceovers.scenes.map((s) => [s.sceneIndex, s]));
        for (const a of manifest.assets) {
            if (a.kind === 'music') continue;
            const scene = plan.scenes[a.sceneIndex];
            if (a.kind === 'video' && a.localPath && fs.existsSync(a.localPath)) {
                const vd = await estimateAudioDurationSafe(a.localPath);
                if (vd > 0) {
                    a.durationSec = vd;
                    scene.durationSec = vd;
                }
            }
            const pa = scene?.personalAudio ? inputVoiceoverPath(scene.personalAudio) : undefined;
            if (pa && fs.existsSync(pa)) {
                const dur = await estimateAudioDurationSafe(pa);
                a.audioPath = pa;
                a.durationSec = dur;
                scene.durationSec = dur;
                a.captionSegments = [{ text: scene.voiceoverText, startMs: 0, endMs: Math.round(dur * 1000) }];
                continue;
            }
            const v = voByScene.get(a.sceneIndex);
            if (v) {
                a.audioPath = v.audioPath;
                a.durationSec = v.durationSec;
                a.captionSegments = v.captionSegments;
                scene.durationSec = v.durationSec;
            }
        }
        // Recalculate total plan duration from updated per-scene durations
        plan.totalDurationSec = plan.scenes.reduce((acc, s) => acc + s.durationSec, 0);
        manifest.voiceoverDriven = voiceovers.voiceoverDriven;
        writeJson(workspace, 'render-manifest.json', manifest);
        writeJson(workspace, 'scene-data.json', {
            jobId,
            title: req.title,
            backend,
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
        updateJob(jobId, {
            gatePass: gate.pass,
            voiceoverDriven: voiceovers.voiceoverDriven,
            state: gate.pass ? 'awaiting_review' : 'failed',
        });
        persistJob(jobRec);
    }

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
    const contactSheet = await makeContactSheet(res);
    const decisionsReport = writeDecisionsReport(res);

    return res;
}
