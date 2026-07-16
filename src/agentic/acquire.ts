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
        for (let c = 0; c < Math.min(candidatesPerAsset, fetched.length); c++) {
            const f = fetched[c];
            const ext = path.extname(f.url).split('?')[0] || (kind === 'image' ? '.jpg' : '.mp4');
            const filename = `candidate_${c + 1}${ext}`;
            // If the fetcher already materialised a real local file (e.g. a cached
            // local music track or a generated placeholder), use it directly and
            // skip the network download entirely.
            const localPath = f.localPath && fs.existsSync(f.localPath)
                ? f.localPath
                : await deps.download(f.url, dir, filename);
            const lic = normalizeLicense(f);
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
