/**
 * acquire.ts — STAGE 2: download candidate assets into isolated folders.
 *
 * For each scene it fetches N candidate visuals (image or video per the plan)
 * into assets/images/scene_XX/ or assets/videos/scene_XX/. For music it
 * resolves N candidate tracks into assets/music/.
 *
 * All network/fetcher dependencies are injected so unit tests run offline
 * with fake providers. The real wiring uses the existing fetchers:
 *   - fetchVisualsForScene / searchImages / searchVideos (visual-fetcher)
 *   - resolveFreeBackgroundMusic (free-music)
 *   - downloadMedia (visual-fetcher) to persist files
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgenticWorkspace, createAgenticWorkspace, sceneImageDir, sceneVideoDir, writeJson } from '../management/workspace.js';
import { AssetCandidate, Plan, ScenePlan } from '../types.js';
import { inputAssetPath } from '../../lib/path-safety.js';
import { aiVerifyAsset } from '../ai/ai-verify.js';
import { ModelBridge, NullBridge, type LlmBridge } from '../ai/bridge.js';

/**
 * Run async producers with a bounded concurrency. `tasks` is an array of
 * zero-arg thunks returning a Promise. At most `limit` run at once; results
 * are returned in the original task order. Each thunk's own error handling is
 * the caller's responsibility (this just bounds how many fire simultaneously).
 */
export async function mapWithConcurrencyLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
    const out: T[] = new Array(tasks.length);
    let cursor = 0;
    async function worker(): Promise<void> {
        while (cursor < tasks.length) {
            const idx = cursor++;
            out[idx] = await tasks[idx]();
        }
    }
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
    await Promise.all(workers);
    return out;
}

/**
 * Resolve the LLM bridge for acquire-stage AI verification, honouring the
 * standing "driver first" rule:
 *   deps.bridge (already driver-aware) -> ModelBridge(deps.brain) -> NullBridge.
 * A NullBridge makes every AI check return null so the signal gates decide.
 * This keeps behaviour identical to before when only `brain` was supplied.
 */
function resolveAcquireBridge(deps: AcquireDeps): LlmBridge {
    if (deps.bridge) return deps.bridge;
    if (deps.brain) {
        // Wrap the legacy brain so vision/audio still work through the unified
        // interface without a driver callback (pure model-tier behaviour).
        const b = new ModelBridge();
        // @ts-expect-error inject the caller-supplied brain instance
        b.brain = deps.brain;
        return b;
    }
    return new NullBridge();
}

/** Ensure every candidate carries an attribution label so the final gate (X6)
 *  can never be blocked by a *missing metadata string* — only by a truly
 *  unknown source. Placeholders are CC0; fetched assets are flagged for the
 *  human to confirm exact attribution before public publishing. */
function normalizeLicense(f: FetchedVisual): { license?: string; licenseUrl?: string } {
    if (f.license && f.license.trim().length > 0) return { license: f.license, licenseUrl: f.licenseUrl };
    const src = f.source || 'unknown';
    if (src === 'placeholder') return { license: 'CC0 (generated placeholder)', licenseUrl: '' };
    return { license: `Source: ${src} — confirm attribution before publishing`, licenseUrl: f.licenseUrl };
}

export interface FetchedVisual {
    url: string;
    localPath: string;
    source: string;
    license?: string;
    licenseUrl?: string;
}

export interface AcquireDeps {
    /** Returns candidate URLs (and metadata) for a scene's visual query. */
    fetchVisual: (
        keywords: string[],
        kind: 'image' | 'video',
        orientation: 'portrait' | 'landscape',
        sceneIndex?: number,
    ) => Promise<FetchedVisual[]>;
    /** Persists a URL to a local path; returns the final path. */
    download: (url: string, dir: string, filename: string) => Promise<string>;
    /** Returns candidate music tracks. */
    fetchMusic: (query: string, count: number) => Promise<FetchedVisual[]>;
    /** OPTIONAL — AI verification (opt-in). When present AND cfg.aiVerify.verifyOnAcquire
     *  is on, each materialised candidate is AI-scored; a failing (non-null)
     *  score drops the candidate. Absent -> no AI check (signal gates only).
     *  `bridge` is the unified LLM boundary (DRIVER -> model -> null); when set
     *  it is used for vision/audio scoring. `brain` is retained for backward
     *  compatibility and used only as a ModelBridge fallback if `bridge` is absent. */
    cfg?: import('../config.js').AgenticConfig;
    bridge?: import('../ai/bridge.js').LlmBridge;
    brain?: import('../ai/brain.js').AgentBrain;
}

/**
 * Last-resort offline fallback: when stock fetching returns nothing for a
 * scene (rate-limited / offline), generate a local ffmpeg asset (clip or
 * image) via the asset-creator module so the render never hangs or ships a
 * blank scene. Zero network, zero keys. Returns a FetchedVisual with
 * source 'asset-creator' (CC0 placeholder).
 */
export function generateFallbackVisual(
    scene: { voiceoverText?: string; searchKeywords?: string[] },
    kind: 'image' | 'video',
    dir: string,
    index: number,
): FetchedVisual | null {
    try {
        // asset-creator is CommonJS; require lazily so the agentic pipeline
        // never depends on it unless actually needed.
        const creator: any = require('../../tools/asset-creator/src/index.js');
        const label = (scene.voiceoverText || scene.searchKeywords?.join(' ') || 'Visual').slice(0, 40);
        const out = path.join(dir, `candidate_${index + 1}${kind === 'video' ? '.mp4' : '.jpg'}`);
        fs.mkdirSync(dir, { recursive: true });
        let localPath: string;
        if (kind === 'video') {
            // KenBurns needs a source image; generate one first, then animate it.
            const imgPath = creator.createBackgroundImage({
                out: out.replace(/\.mp4$/, '_src.jpg'),
                text: label,
                w: 720,
                h: 1280,
            });
            localPath = creator.createKenBurnsClip({ src: imgPath, out, duration: 4, zoom: 1.15 });
        } else {
            localPath = creator.createBackgroundImage({ out, text: label, w: 720, h: 1280 });
        }
        if (!localPath || !fs.existsSync(localPath)) return null;
        return {
            url: `asset-creator://${path.basename(localPath)}`,
            localPath,
            source: 'asset-creator',
            license: 'CC0 (offline ffmpeg-generated fallback)',
            licenseUrl: '',
        };
    } catch (e) {
        console.warn(`⚠ fallback asset generation failed: ${(e as Error)?.message ?? e}`);
        return null;
    }
}

export interface AcquireResult {
    workspace: AgenticWorkspace;
    candidates: AssetCandidate[];
}

export async function acquireAssets(plan: Plan, deps: AcquireDeps, candidatesPerAsset = 2): Promise<AcquireResult> {
    const ws = createAgenticWorkspace(plan.jobId);
    const candidates: AssetCandidate[] = [];
    const sceneFetches: Array<
        () => Promise<{ i: number; kind: 'image' | 'video'; dir: string; scene: ScenePlan; fetched: FetchedVisual[] }>
    > = [];

    for (let i = 0; i < plan.scenes.length; i++) {
        const scene = plan.scenes[i];
        const kind = scene.visualPreference;
        const dir = kind === 'image' ? sceneImageDir(ws, i) : sceneVideoDir(ws, i);

        // P1a — local asset reuse: if this scene is bound to a user file in
        // input/visuals/, copy it in directly and skip stock fetching.
        if (scene.localAsset) {
            const srcPath = inputAssetPath(scene.localAsset);
            if (fs.existsSync(srcPath)) {
                const ext = path.extname(scene.localAsset).toLowerCase();
                const isVideo = ['.mp4', '.mov', '.webm', '.m4v'].includes(ext);
                const destName = `candidate_1${ext}`;
                const destPath = path.join(dir, destName);
                fs.mkdirSync(dir, { recursive: true });
                if (!fs.existsSync(destPath)) fs.copyFileSync(srcPath, destPath);
                candidates.push({
                    kind: isVideo ? 'video' : 'image',
                    sceneIndex: i,
                    candidateIndex: 1,
                    localPath: destPath,
                    url: `local://${scene.localAsset}`,
                    source: 'local-asset',
                    license: 'User-supplied — owner attribution',
                    licenseUrl: '',
                    keywords: scene.searchKeywords,
                });
                continue; // done with this scene
            }
            // File missing → fall through to stock fetch below.
        }

        // Fetch all scenes with a bounded concurrency so a 20-scene plan does
        // not fire 20 simultaneous outbound API calls (rate-limit / memory).
        // Rejections are isolated per scene so one bad fetch can't kill the run.
        sceneFetches.push(() =>
            deps
                .fetchVisual(scene.searchKeywords, kind, plan.orientation, i)
                .then((fetched) => ({ i, kind, dir, scene, fetched }))
                .catch((e) => {
                    console.warn(`⚠ fetch failed for scene ${i}: ${(e as Error)?.message ?? e}`);
                    return { i, kind, dir, scene, fetched: [] as FetchedVisual[] };
                }),
        );
    }
    const MAX_CONCURRENT_FETCHES = 6;
    const results = await mapWithConcurrencyLimit(sceneFetches, MAX_CONCURRENT_FETCHES);
    const downloadTasks: (() => Promise<void>)[] = [];

    for (const { i, kind, dir, scene, fetched } of results) {
        // No stock candidates for this scene → generate an offline fallback
        // (asset-creator / ffmpeg) instead of leaving the scene blank.
        if (fetched.length === 0) {
            const fb = generateFallbackVisual(scene, kind, dir, 0);
            if (fb) {
                candidates.push({
                    kind,
                    sceneIndex: i,
                    candidateIndex: 1,
                    localPath: fb.localPath,
                    url: fb.url,
                    source: fb.source,
                    license: fb.license,
                    licenseUrl: fb.licenseUrl,
                    keywords: scene.searchKeywords,
                });
            }
            continue;
        }
        for (let c = 0; c < Math.min(candidatesPerAsset, fetched.length); c++) {
            const f = fetched[c];
            downloadTasks.push(async () => {
                const ext = path.extname(f.url).split('?')[0] || (kind === 'image' ? '.jpg' : '.mp4');
                const filename = `candidate_${c + 1}${ext}`;
                // Always materialise the asset into THIS scene's isolated dir. Never
                // trust f.localPath as the final path — it may be a shared cache
                // or a stale file from a previous job, which would poison the
                // render (mixed asset kinds, wrong durations). Copy if a real
                // local file exists, otherwise download from the URL.
                const destPath = path.join(dir, filename);
                let localPath = destPath;
                try {
                    if (f.localPath && fs.existsSync(f.localPath)) {
                        fs.mkdirSync(dir, { recursive: true });
                        fs.copyFileSync(f.localPath, destPath);
                    } else {
                        localPath = await deps.download(f.url, dir, filename);
                    }
                } catch (e) {
                    console.warn(`⚠ asset materialise failed for scene ${i}: ${(e as Error)?.message ?? e}`);
                    return; // skip this candidate; never register a ghost (unwritten) path
                }
                const lic = normalizeLicense(f);
                // OPT-IN AI verify (acquire stage): score the materialised
                // candidate with the agent's own model. A non-null FAILING score
                // drops this candidate (next source in the ladder is tried). A
                // null result (no model / offline) is ignored -> signal gates decide.
                if (deps.cfg?.aiVerify?.verifyOnAcquire) {
                    const ai = await aiVerifyAsset(
                        localPath,
                        kind,
                        scene.searchKeywords,
                        deps.cfg,
                        resolveAcquireBridge(deps),
                    );
                    if (ai && !ai.pass) {
                        console.warn(
                            `⚠ ai(acquire) rejected scene ${i} cand ${c + 1}: ${ai.reason} (conf ${ai.confidence})`,
                        );
                        return;
                    }
                }
                candidates.push({
                    kind,
                    sceneIndex: i,
                    candidateIndex: c + 1,
                    localPath,
                    url: f.url,
                    source: f.source,
                    license: lic.license,
                    licenseUrl: lic.licenseUrl,
                    keywords: scene.searchKeywords,
                });
            });
        }
    }

    // Music candidates
    const musicFetched = await deps.fetchMusic(plan.musicQuery, candidatesPerAsset);
    for (let c = 0; c < Math.min(candidatesPerAsset, musicFetched.length); c++) {
        const f = musicFetched[c];
        downloadTasks.push(async () => {
            const ext = path.extname(f.url).split('?')[0] || '.mp3';
            const filename = `candidate_${c + 1}${ext}`;
            let localPath;
            try {
                localPath =
                    f.localPath && fs.existsSync(f.localPath) ? f.localPath : await deps.download(f.url, ws.musicDir, filename);
            } catch (e) {
                console.warn(`⚠ music materialise failed for cand ${c + 1}: ${(e as Error)?.message ?? e}`);
                return; // skip this music candidate; never register a ghost (unwritten) path
            }
            const lic = normalizeLicense(f);
            // OPT-IN AI music-mood check (acquire stage): music has no speech
            // transcript, so we judge mood-fit from the plan's intended mood
            // (plan.musicQuery) against the track's tags/source. A non-null
            // FAILING score drops this candidate. A null result is ignored.
            if (deps.cfg?.aiVerify?.verifyOnAcquire && deps.cfg?.aiVerify?.checkMusicMood) {
                const proxy = `intended mood: ${plan.musicQuery}; track source: ${f.source || 'free-music'}`;
                const ai = await aiVerifyAsset(
                    localPath,
                    'audio',
                    [plan.musicQuery],
                    deps.cfg,
                    resolveAcquireBridge(deps),
                    proxy,
                );
                if (ai && !ai.pass) {
                    console.warn(`⚠ ai(acquire) rejected music cand ${c + 1}: ${ai.reason} (conf ${ai.confidence})`);
                    return;
                }
            }
            candidates.push({
                kind: 'music',
                sceneIndex: -1,
                candidateIndex: c + 1,
                localPath,
                url: f.url,
                source: f.source,
                license: lic.license,
                licenseUrl: lic.licenseUrl,
                keywords: [plan.musicQuery],
            });
        });
    }

    const MAX_CONCURRENT_DOWNLOADS = 4;
    await mapWithConcurrencyLimit(downloadTasks, MAX_CONCURRENT_DOWNLOADS);

    // Sort to keep deterministic scene and candidate order in manifest / output
    candidates.sort((a, b) => {
        if (a.kind === 'music' && b.kind !== 'music') return 1;
        if (a.kind !== 'music' && b.kind === 'music') return -1;
        if (a.sceneIndex !== b.sceneIndex) {
            return a.sceneIndex - b.sceneIndex;
        }
        return a.candidateIndex - b.candidateIndex;
    });

    writeJson(ws, 'candidates.json', candidates);
    return { workspace: ws, candidates };
}
