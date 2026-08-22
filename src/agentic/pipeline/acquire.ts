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
import { execFileSync } from 'node:child_process';
import { AgenticWorkspace, createAgenticWorkspace, sceneImageDir, sceneVideoDir, writeJson } from '../management/workspace.js';
import { AssetCandidate, Plan, ScenePlan } from '../types.js';
import { inputAssetPath } from '../../lib/path-safety.js';
import { aiVerifyAsset } from '../ai/ai-verify.js';
import { ModelBridge, NullBridge, type LlmBridge } from '../ai/bridge.js';
import { trimBlackFrames } from '../../lib/media-downloader.js';
import { getCached, putCache } from '../operations/asset-cache.js';
import { isUniformPlaceholderImage } from './asset-validators.js';
import { isGenEnabled, generateSceneImage, buildGenPrompt } from '../../lib/gen-image.js';
import { isVideoGenEnabled, generateSceneVideo, buildVideoGenPrompt } from '../../lib/gen-video.js';
import { enqueueJob, getJobResult } from '../../lib/ai/job-queue.js';
import type { AiJobKind } from '../../lib/ai/types.js';

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
 * Download an asset with a HARD timeout. A dead/slow stock host (e.g. a sandbox
 * with no egress, or a provider that hangs instead of 404-ing) must NOT stall
 * the whole acquire stage for minutes — the earlier behaviour was a 400s hang
 * that produced zero candidates. On timeout (or any download error) we return
 * null so the caller can fall back to the offline ffmpeg placeholder instead of
 * leaving the scene asset-less. Default budget 30s; tunable via env.
 */
async function downloadWithTimeout(
    deps: AcquireDeps,
    url: string,
    dir: string,
    filename: string,
): Promise<string | null> {
    const budgetMs = Number(process.env.AGENTIC_DOWNLOAD_TIMEOUT_MS || 30000);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`download timeout after ${budgetMs}ms`)), budgetMs);
    });
    try {
        const localPath = await Promise.race([
            deps.download(url, dir, filename),
            timeout,
        ]);
        return localPath;
    } catch (e) {
        console.warn(`⚠ download timed out/failed (${url.slice(0, 60)}…): ${(e as Error)?.message ?? e}`);
        return null;
    } finally {
        if (timer) clearTimeout(timer);
    }
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
        orientation: 'portrait' | 'landscape' | 'square',
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
    /**
     * OPTIONAL — local material pool (off by default). When true, scenes with
     * no explicit `localAsset` bind round-robin to media files found under
     * input/visuals/ (any .mp4/.mov/.webm/.m4v/.jpg/.jpeg/.png/.webp),
     * skipping stock fetching entirely. This is the "use my own footage"
     * mode (MoneyPrinter-style local material selection), zero-cost + offline.
     * False/absent → stock pipeline byte-for-byte unchanged.
     */
    localPool?: boolean;
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
        fs.mkdirSync(dir, { recursive: true });
        const out = path.join(dir, `candidate_${index + 1}${kind === 'video' ? '.mp4' : '.jpg'}`);

        // Offline asset generation — ZERO network, ZERO API keys.
        // A real asset is produced entirely by ffmpeg (ffmpeg-static, already a
        // production dependency) so no new packages or network calls are
        // introduced:
        //   image: a 720x1280 branded gradient via the `gradients` lavfi source.
        //   video: the same gradient animated with a zoompan "Ken Burns" pan
        //           over a silent audio track (libx264/aac in an mp4).
        // ffmpeg-static is a production dependency; load it lazily so the
        // agentic pipeline never touches ffmpeg unless a fallback is needed.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ffmpegPath: string = require('ffmpeg-static');

        if (fs.existsSync(out)) fs.rmSync(out, { force: true });

        if (kind === 'video') {
            const filter =
                '[0:v]scale=1440:2560,zoompan=z=1.15:d=100:s=720x1280:fps=25,format=yuv420p[v]';
            execFileSync(
                ffmpegPath,
                [
                    '-y',
                    '-f', 'lavfi',
                    '-i', 'gradients=s=720x1280:c0=0x1e3a8a:c1=0x0f172a:x0=0:y0=0:x1=0:y1=720:nb_colors=2',
                    '-f', 'lavfi',
                    '-i', 'anullsrc=r=44100:cl=stereo',
                    '-filter_complex', filter,
                    '-map', '[v]',
                    '-map', '1:a',
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-t', '4',
                    '-shortest',
                    out,
                ],
                { stdio: 'pipe' },
            );
        } else {
            execFileSync(
                ffmpegPath,
                [
                    '-y',
                    '-f', 'lavfi',
                    '-i', 'gradients=s=720x1280:c0=0x1e3a8a:c1=0x0f172a:x0=0:y0=0:x1=0:y1=720:nb_colors=2',
                    '-frames:v', '1',
                    out,
                ],
                { stdio: 'pipe' },
            );
        }

        if (!fs.existsSync(out) || fs.statSync(out).size === 0) return null;
        return {
            url: `asset-creator://${path.basename(out)}`,
            localPath: out,
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

/** Media extensions accepted from the local material pool. */
const POOL_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.jpg', '.jpeg', '.png', '.webp']);

/** Scanned pool files (lazy, once per process). Sorted for deterministic order. */
let _poolCache: string[] | null = null;

/**
 * Return the media file at `sceneIndex` in the local material pool
 * (input/visuals/), round-robin when scenes outnumber files. Returns null when
 * the pool is empty or unreadable — the caller then falls through to stock.
 * Deterministic: the pool is scanned once and sorted, so repeated runs and
 * multi-scene jobs bind the same files to the same scenes.
 */
function localPoolEntry(sceneIndex: number): string | null {
    if (_poolCache === null) scanPool();
    if (_poolCache!.length === 0) return null;
    const chosen = _poolCache![sceneIndex % _poolCache!.length];
    // A stale cache entry (files deleted since scan) must not break a scene:
    // re-scan once, then fall through to stock if still empty.
    if (!fs.existsSync(chosen)) {
        scanPool();
        if (_poolCache!.length === 0) return null;
        return _poolCache![sceneIndex % _poolCache!.length];
    }
    return chosen;
}

/** (Re)scan input/visuals for media files. Sorted for deterministic order. */
function scanPool(): void {
    try {
        const dir = inputAssetPath();
        _poolCache = fs.existsSync(dir)
            ? fs.readdirSync(dir)
                  .filter((f) => POOL_EXTENSIONS.has(path.extname(f).toLowerCase()))
                  .sort()
                  .map((f) => path.join(dir, f))
            : [];
    } catch {
        _poolCache = [];
    }
}

export async function acquireAssets(plan: Plan, deps: AcquireDeps, candidatesPerAsset = 2): Promise<AcquireResult> {
    const ws = createAgenticWorkspace(plan.jobId);
    const candidates: AssetCandidate[] = [];
    const sceneFetches: Array<
        () => Promise<{ i: number; kind: 'image' | 'video' | 'gen' | 'video-gen' | 'gen-local' | 'video-gen-local'; dir: string; scene: ScenePlan; fetched: FetchedVisual[] }>
    > = [];

    for (let i = 0; i < plan.scenes.length; i++) {
        const scene = plan.scenes[i];
        const kind = scene.visualPreference;
        const dir = kind === 'image' ? sceneImageDir(ws, i) : sceneVideoDir(ws, i);

        // Feature A — AI-generated visual preference ('gen'): when a generation
        // key is configured, produce the still via an OpenAI-compatible image
        // endpoint; otherwise treat 'gen' exactly like 'image' (stock fallback).
        // Generation failures return '' so the stock ladder below runs normally.
        if (kind === 'gen' && isGenEnabled()) {
            fs.mkdirSync(dir, { recursive: true });
            const genPath = await generateSceneImage({
                prompt: buildGenPrompt(scene.searchKeywords, scene.voiceoverText || '', plan.orientation),
                outDir: dir,
                filename: 'candidate_1.jpg',
                orientation: plan.orientation,
            });
            if (genPath) {
                candidates.push({
                    kind: 'image',
                    sceneIndex: i,
                    candidateIndex: 1,
                    localPath: genPath,
                    url: `gen://${path.basename(genPath)}`,
                    source: 'ai-generated',
                    license: 'AI-generated — owner holds rights under provider ToS',
                    licenseUrl: '',
                    keywords: scene.searchKeywords,
                });
                continue; // done; skip stock fetch
            }
            // Fall through to stock fetch with kind coerced to 'image'.
        }
        // Feature 1 — AI-generated MOTION (text-to-video) 'video-gen': when a
        // T2V key is configured, produce a short clip via an OpenAI-compatible
        // /videos/generations (or Kling/Seedream/Runway/Luma) endpoint; otherwise
        // treat exactly like 'video' (stock fallback). Failures return '' so the
        // stock ladder below runs normally.
        if (kind === 'video-gen' && isVideoGenEnabled()) {
            fs.mkdirSync(dir, { recursive: true });
            const genPath = await generateSceneVideo({
                prompt: buildVideoGenPrompt(scene.searchKeywords, scene.voiceoverText || '', plan.orientation, scene.durationSec),
                outDir: dir,
                filename: 'candidate_1.mp4',
                orientation: plan.orientation,
                durationSec: scene.durationSec,
            });
            if (genPath) {
                candidates.push({
                    kind: 'video',
                    sceneIndex: i,
                    candidateIndex: 1,
                    localPath: genPath,
                    url: `gen://${path.basename(genPath)}`,
                    source: 'ai-generated-video',
                    license: 'AI-generated — owner holds rights under provider ToS',
                    licenseUrl: '',
                    keywords: scene.searchKeywords,
                });
                continue; // done; skip stock fetch
            }
            // Fall through to stock fetch with kind coerced to 'video'.
        }
        const effectiveKind: 'image' | 'video' = kind === 'gen' ? 'image' : kind === 'video-gen' ? 'video' : kind === 'gen-local' ? 'image' : kind === 'video-gen-local' ? 'video' : kind;

        // P1b — local material pool (off by default): when enabled and the
        // scene has no explicit localAsset, bind round-robin to media files
        // found under input/visuals/ so users can drive videos from their own
        // footage without stock fetching. Skipped when a file is missing so
        // the stock ladder below still runs (never blocks a scene).
        if (deps.localPool && !scene.localAsset) {
            const poolEntry = localPoolEntry(i);
            if (poolEntry) {
                const ext = path.extname(poolEntry).toLowerCase();
                const isVideo = ['.mp4', '.mov', '.webm', '.m4v'].includes(ext);
                const destName = `candidate_${i + 1}${ext}`;
                const destPath = path.join(dir, destName);
                fs.mkdirSync(dir, { recursive: true });
                if (!fs.existsSync(destPath)) fs.copyFileSync(poolEntry, destPath);
                candidates.push({
                    kind: isVideo ? 'video' : 'image',
                    sceneIndex: i,
                    candidateIndex: 1,
                    localPath: destPath,
                    url: `local-pool://${path.basename(poolEntry)}`,
                    source: 'local-pool',
                    license: 'User-supplied — owner attribution',
                    licenseUrl: '',
                    keywords: scene.searchKeywords,
                });
                continue; // done with this scene
            }
        }

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
                .fetchVisual(scene.searchKeywords, effectiveKind, plan.orientation, i)
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

    for (const { i, kind: rawKind, dir, scene, fetched } of results) {
        // Coerce 'gen' → 'image' for all registration/fallback paths below.
        const kind = rawKind === 'gen' ? 'image' : rawKind === 'video-gen' ? 'video' : rawKind === 'gen-local' ? 'image' : rawKind === 'video-gen-local' ? 'video' : rawKind;
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
                //
                // P2: Shared asset cache — check if this URL was already downloaded
                // for a previous job. If so, reuse the cached file instead of
                // re-downloading (saves network + RAM in batch mode).
                const destPath = path.join(dir, filename);
                let localPath = destPath;
                let usedFallback = false;
                try {
                    // Check shared cache first
                    if (f.url && f.url.startsWith('http')) {
                        const cached = getCached(f.url);
                        if (cached && fs.existsSync(cached.localPath)) {
                            fs.mkdirSync(dir, { recursive: true });
                            fs.copyFileSync(cached.localPath, destPath);
                            localPath = destPath;
                            // A cached OFFLINE fallback (asset-creator/placeholder) keeps
                            // its usedFallback flag so the uniform-content gate below does
                            // not re-reject it as a "swatch".
                            if (cached.source === 'asset-creator' || cached.source === 'placeholder') {
                                usedFallback = true;
                            }
                        } else if (f.localPath && fs.existsSync(f.localPath)) {
                            fs.mkdirSync(dir, { recursive: true });
                            fs.copyFileSync(f.localPath, destPath);
                            // Store in cache for future jobs
                            putCache(f.url, f.localPath, { source: f.source, license: f.license, licenseUrl: f.licenseUrl });
                        } else {
                            const downloaded1 = await downloadWithTimeout(deps, f.url, dir, filename);
                            // Download hung/failed → fall back to the offline
                            // ffmpeg placeholder so the scene still gets a real
                            // asset instead of a blank/undefined path.
                            if (downloaded1) {
                                localPath = downloaded1;
                            } else {
                                const fb = generateFallbackVisual(scene, kind, dir, c);
                                if (fb) {
                                    localPath = fb.localPath;
                                    usedFallback = true;
                                }
                            }
                            // Store in cache for future jobs — only a REAL download,
                            // never the offline fallback (caching a fallback under the
                            // URL key would make a later run treat the placeholder as
                            // the URL's content and re-fail the content gate).
                            if (downloaded1 && fs.existsSync(downloaded1)) {
                                putCache(f.url, downloaded1, { source: f.source, license: f.license, licenseUrl: f.licenseUrl });
                            }
                        }
                    } else if (f.localPath && fs.existsSync(f.localPath)) {
                        fs.mkdirSync(dir, { recursive: true });
                        fs.copyFileSync(f.localPath, destPath);
                    } else {
                        const downloaded2 = await downloadWithTimeout(deps, f.url, dir, filename);
                        if (downloaded2) {
                            localPath = downloaded2;
                        } else {
                            const fb = generateFallbackVisual(scene, kind, dir, c);
                            if (fb) {
                                localPath = fb.localPath;
                                usedFallback = true;
                            }
                        }
                        // Only cache a REAL download, never the offline fallback.
                        if (downloaded2 && fs.existsSync(downloaded2)) {
                            putCache(f.url, downloaded2, { source: f.source, license: f.license, licenseUrl: f.licenseUrl });
                        }
                    }
                } catch (e) {
                    console.warn(`⚠ asset materialise failed for scene ${i}: ${(e as Error)?.message ?? e}`);
                    return; // skip this candidate; never register a ghost (unwritten) path
                }
                // Trim black frames from video candidates (Pexels fade-in fix)
                if (kind === 'video' && localPath && fs.existsSync(localPath)) {
                    try {
                        const trimmed = trimBlackFrames(localPath);
                        if (trimmed !== localPath) {
                            localPath = trimmed;
                        }
                    } catch (e) {
                        // Non-fatal: if trim fails, use the original
                        console.warn(`⚠ black frame trim failed for scene ${i}: ${(e as Error)?.message ?? e}`);
                    }
                }
                const lic = normalizeLicense(f);
                // Kind/extension mismatch guard: fallback providers can return
                // a VIDEO url for an image request (observed: image scene got
                // candidate_1.webm → rendered as a frozen 'still'). Reclassify
                // by actual extension so downstream FX (Ken Burns vs trim)
                // treat the asset correctly.
                const actualExt = path.extname(localPath).toLowerCase();
                const VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.m4v', '.mkv'];
                const effectiveKind: typeof kind =
                    kind === 'image' && VIDEO_EXTS.includes(actualExt) ? 'video'
                    : kind === 'video' && ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(actualExt) ? 'image'
                    : kind;
                if (effectiveKind !== kind) {
                    console.warn(`⚠ scene ${i} cand ${c + 1}: requested ${kind} but got ${actualExt} — reclassified as ${effectiveKind}`);
                }
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
                // Content gate: reject near-uniform / solid-color placeholders
                // (degenerate swatch visuals). Matrix QA found a flat gradient
                // being accepted as a real scene image. Skip it so the scene
                // falls through to the next source, or a proper fallback.
                // NOTE: the offline asset-creator fallback is a DELIBERATE,
                // labeled placeholder — it is exempt from this gate so graceful
                // degradation actually yields a usable asset instead of being
                // re-rejected as a "swatch".
                if (effectiveKind === 'image' && !usedFallback && isUniformPlaceholderImage(localPath)) {
                    console.warn(
                        `⚠ scene ${i} cand ${c + 1}: near-uniform placeholder (no real content) — skipped; trying next source`,
                    );
                    return;
                }
                candidates.push({
                    kind: effectiveKind,
                    sceneIndex: i,
                    candidateIndex: c + 1,
                    localPath,
                    url: f.url,
                    // Honest source labeling: a "fetched" candidate that actually
                    // resolved to a generated placeholder must be labeled so the
                    // render manifest / attribution never lies (matrix QA found a
                    // solid-color gradient mislabeled "Source: openverse/pexels").
                    source: isUniformPlaceholderImage(localPath) ? 'placeholder' : (f.source || 'unknown'),
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
            let localPath: string | undefined;
            try {
                // Check shared cache first for music too
                if (f.url && f.url.startsWith('http')) {
                    const cached = getCached(f.url);
                    if (cached && fs.existsSync(cached.localPath)) {
                        const destPath = path.join(ws.musicDir, filename);
                        fs.mkdirSync(ws.musicDir, { recursive: true });
                        fs.copyFileSync(cached.localPath, destPath);
                        localPath = destPath;
                    } else if (f.localPath && fs.existsSync(f.localPath)) {
                        localPath = f.localPath;
                        putCache(f.url, f.localPath, { source: f.source, license: f.license, licenseUrl: f.licenseUrl });
                    } else {
                        const downloaded = await downloadWithTimeout(deps, f.url, ws.musicDir, filename);
                        if (downloaded) {
                            localPath = downloaded;
                            if (fs.existsSync(localPath)) {
                                putCache(f.url, localPath, { source: f.source, license: f.license, licenseUrl: f.licenseUrl });
                            }
                        }
                    }
                } else {
                    localPath = f.localPath && fs.existsSync(f.localPath) ? f.localPath : await downloadWithTimeout(deps, f.url, ws.musicDir, filename) ?? undefined;
                }
            } catch (e) {
                console.warn(`⚠ music materialise failed for cand ${c + 1}: ${(e as Error)?.message ?? e}`);
                return;
            }
            if (!localPath) {
                return;
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
    // Soft deadline (default 90s, env-tunable, 0 disables): stop WAITING for
    // stragglers and flush whatever candidates have already materialised.
    // Previously the only bound was the pipeline's outer hard timebox, which
    // ABANDONED the whole acquireAssets promise on expiry — discarding every
    // fully-downloaded candidate (observed: 3 videos landed at t=113s, timebox
    // fired at 120s, pipeline received [] and fell back to offline placeholders).
    const softDeadlineMs = Number(process.env.ACQUIRE_SOFT_DEADLINE_MS ?? 90000);
    if (softDeadlineMs > 0) {
        await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve();
            };
            const timer = setTimeout(() => {
                console.warn(
                    `⚠ acquire soft deadline (${softDeadlineMs}ms) — flushing ${candidates.length} candidate(s) fetched so far`,
                );
                finish();
            }, softDeadlineMs);
            mapWithConcurrencyLimit(downloadTasks, MAX_CONCURRENT_DOWNLOADS).then(finish, finish);
        });
    } else {
        await mapWithConcurrencyLimit(downloadTasks, MAX_CONCURRENT_DOWNLOADS);
    }

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
