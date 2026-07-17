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
import {
    AgenticWorkspace,
    createAgenticWorkspace,
    sceneImageDir,
    sceneVideoDir,
    writeJson,
} from './workspace.js';
import { AssetCandidate, Plan } from './types.js';
import { inputAssetPath } from '../lib/path-safety.js';
import { aiVerifyAsset } from './ai-verify.js';

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
    fetchVisual: (keywords: string[], kind: 'image' | 'video', orientation: 'portrait' | 'landscape', sceneIndex?: number) => Promise<FetchedVisual[]>;
    /** Persists a URL to a local path; returns the final path. */
    download: (url: string, dir: string, filename: string) => Promise<string>;
    /** Returns candidate music tracks. */
    fetchMusic: (query: string, count: number) => Promise<FetchedVisual[]>;
    /** OPTIONAL — AI verification (opt-in). When present AND cfg.aiVerify.verifyOnAcquire
     *  is on, each materialised candidate is AI-scored; a failing (non-null)
     *  score drops the candidate. Absent -> no AI check (signal gates only). */
    cfg?: import('./config.js').AgenticConfig;
    brain?: import('./brain.js').AgentBrain;
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
            localPath = creator.createKenBurnsClip({ out, text: label, w: 720, h: 1280, duration: 4 });
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
    const sceneFetches: Promise<{ i: number; kind: 'image' | 'video'; dir: string; scene: any; fetched: FetchedVisual[] }>[] = [];

    for (let i = 0; i < plan.scenes.length; i++) {
        const scene = plan.scenes[i];
        const kind = scene.visualPreference;
        const dir = kind === 'image' ? sceneImageDir(ws, i) : sceneVideoDir(ws, i);

        // P1a — local asset reuse: if this scene is bound to a user file in
        // input/input-assets/, copy it in directly and skip stock fetching.
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

        // Fetch all scenes in parallel (bounded by the fetcher's own limits).
        // Rejections are isolated per scene so one bad fetch can't kill the run.
        sceneFetches.push(
            deps.fetchVisual(scene.searchKeywords, kind, plan.orientation, i)
                .then((fetched) => ({ i, kind, dir, scene, fetched }))
                .catch((e) => {
                    console.warn(`⚠ fetch failed for scene ${i}: ${(e as Error)?.message ?? e}`);
                    return { i, kind, dir, scene, fetched: [] as FetchedVisual[] };
                }),
        );
    }
    const results = await Promise.all(sceneFetches);
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
                localPath = destPath;
            }
            const lic = normalizeLicense(f);
            // OPT-IN AI verify (acquire stage): score the materialised
            // candidate with the agent's own model. A non-null FAILING score
            // drops this candidate (next source in the ladder is tried). A
            // null result (no model / offline) is ignored -> signal gates decide.
            if (deps.brain && deps.cfg?.aiVerify?.verifyOnAcquire) {
                const ai = await aiVerifyAsset(localPath, kind, scene.searchKeywords, deps.cfg, deps.brain);
                if (ai && !ai.pass) {
                    console.warn(`⚠ ai(acquire) rejected scene ${i} cand ${c + 1}: ${ai.reason} (conf ${ai.confidence})`);
                    continue;
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
        }
    }

    // Music candidates
    const musicFetched = await deps.fetchMusic(plan.musicQuery, candidatesPerAsset);
    for (let c = 0; c < Math.min(candidatesPerAsset, musicFetched.length); c++) {
        const f = musicFetched[c];
        const ext = path.extname(f.url).split('?')[0] || '.mp3';
        const filename = `candidate_${c + 1}${ext}`;
        const localPath = f.localPath && fs.existsSync(f.localPath)
            ? f.localPath
            : await deps.download(f.url, ws.musicDir, filename);
        const lic = normalizeLicense(f);
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
    }

    writeJson(ws, 'candidates.json', candidates);
    return { workspace: ws, candidates };
}
