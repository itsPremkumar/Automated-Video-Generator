/**
 * bulk-fetch.ts — Direct asset harvesting by subject, independent of the
 * script/scene pipeline.
 *
 * Enables plain commands like "download 10 eagle images" or "download 5 ocean
 * wave videos" straight from agentic-scripts.json (mode + searchQuery +
 * downloadCount) without ever building a video plan.
 *
 * Reuses the project's real fetchers:
 *   - searchImages()       (Pexels when API key set, else Openverse fallback)
 *   - fetchVisualsForScene() (Openverse/Wikimedia fallback ladder)
 *   - downloadMedia()      (production downloader w/ cache + size guard)
 *
 * All results are de-duplicated by URL so you get `count` DISTINCT files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { searchImages, searchVideos, fetchVisualsForScene, downloadMedia } from '../../lib/visual-fetcher/index.js';

function ff(): string {
    const p = ffmpegPath as unknown as string;
    if (!p || !fs.existsSync(p)) throw new Error('ffmpeg-static binary not found');
    return p;
}

// Map a palette keyword → [r,g,b] target for dominant-color matching.
const PALETTE_TARGETS: Record<string, [number, number, number]> = {
    blue: [30, 90, 200], red: [200, 40, 40], green: [40, 170, 70],
    yellow: [230, 200, 40], orange: [230, 130, 40], purple: [140, 60, 200],
    pink: [230, 100, 170], black: [20, 20, 20], white: [235, 235, 235],
    teal: [20, 160, 160], cyan: [40, 200, 220], magenta: [210, 40, 200],
    brown: [130, 80, 40], gray: [130, 130, 130], grey: [130, 130, 130],
};

/** Compute the dominant color of an image via ffmpeg signalstats + a 1x1 crop. */
function dominantColor(imgPath: string): [number, number, number] | undefined {
    try {
        const out = path.join(path.dirname(imgPath), `.dom_${path.basename(imgPath)}.png`);
        // scale to 1px; the single pixel ≈ average color
        execFileSync(ff(), ['-y', '-i', imgPath, '-vf', 'scale=1:1', '-frames:v', '1', out], { stdio: 'ignore', timeout: 20000 });
        if (!fs.existsSync(out)) return undefined;
        // read raw RGB from the PNG (no lib) — use ffmpeg again to dump rawvideo
        const raw = path.join(path.dirname(imgPath), `.dom_${path.basename(imgPath)}.raw`);
        execFileSync(ff(), ['-y', '-i', out, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw], { stdio: 'ignore', timeout: 20000 });
        const buf = fs.readFileSync(raw);
        const r = buf[0] ?? 0, g = buf[1] ?? 0, b = buf[2] ?? 0;
        fs.rmSync(out, { force: true }); fs.rmSync(raw, { force: true });
        return [r, g, b];
    } catch { return undefined; }
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

export interface BulkFetchOptions {
    orientation?: 'portrait' | 'landscape' | 'square' | '';
    kind?: 'image' | 'video';
    /** License filter (e.g. 'cc0', 'public'). Passed to Openverse when available. */
    license?: string;
    /** Dominant color hint (CSS color name) used as a soft pre-filter on metadata. */
    palette?: string;
}

/**
 * Download up to `count` DISTINCT images (or videos) of `query`.
 * @returns list of local file paths that were successfully written.
 */
export async function runBulkImageFetch(
    query: string,
    count: number,
    outDir: string,
    orientation: 'portrait' | 'landscape' | 'square' | '' = '',
    kind: 'image' | 'video' = 'image',
    opts: BulkFetchOptions = {},
): Promise<string[]> {
    fs.mkdirSync(outDir, { recursive: true });
    const seen = new Set<string>();
    const results: string[] = [];
    const extFallback = kind === 'video' ? '.mp4' : '.jpg';

    const tryCollect = async (collector: () => Promise<{ url: string; source?: string }[]>): Promise<void> => {
        if (results.length >= count) return;
        let items: { url: string; source?: string }[] = [];
        try {
            items = await collector();
        } catch (e) {
            console.warn(`  ⚠ collector failed for "${query}": ${(e as Error)?.message ?? e}`);
            return;
        }
        for (const it of items) {
            if (results.length >= count) break;
            if (!it?.url || seen.has(it.url)) continue;
            seen.add(it.url);
            const ext = path.extname(it.url).split('?')[0] || extFallback;
            const filename = `${kind}_${String(results.length + 1).padStart(3, '0')}${ext}`;
            try {
                const r = await downloadMedia(it.url, outDir, filename);
                if (!(r.path && fs.existsSync(r.path))) continue;
                // Palette pre-filter: only keep images whose dominant color
                // is near the requested hue (best-effort, images only).
                if (opts.palette && kind === 'image') {
                    const target = PALETTE_TARGETS[opts.palette.toLowerCase()];
                    const dom = dominantColor(r.path);
                    if (target && dom) {
                        const dist = colorDistance(dom, target);
                        if (dist > 110) { fs.rmSync(r.path, { force: true }); continue; }
                    }
                }
                results.push(r.path);
            } catch (e) {
                console.warn(`  ⚠ download failed for ${it.url}: ${(e as Error)?.message ?? e}`);
            }
        }
    };

    // 1) Pexels (best quality) when an API key is configured.
    if (kind === 'image') {
        await tryCollect(async () => {
            const imgs = await searchImages(query, Math.max(count, 15), 1, orientation || '');
            return imgs.map((i: any) => ({ url: i.url, source: 'pexels' }));
        });
    } else {
        await tryCollect(async () => {
            const vids = await searchVideos(query, Math.max(count, 15), 1, orientation || '');
            return vids.map((v: any) => ({ url: v.url, source: 'pexels' }));
        });
    }

    // 2) Openverse / Wikimedia fallback ladder (works with zero API keys).
    //    Openverse supports `license` / `license_type` and `colors` query params;
    //    we pass them through when present.
    let page = 0;
    while (results.length < count && page < 8) {
        const more = await tryCollect(async () => {
            const res = await fetchVisualsForScene([query], kind === 'video', (orientation || 'portrait') as any, undefined, page * count);
            // Soft license/palette pre-filter on the returned metadata.
            let arr = !res ? [] : Array.isArray(res) ? res : [res];
            if (opts.license) arr = arr.filter((a: any) => (a.license ?? '').toLowerCase().includes(opts.license!.toLowerCase()));
            return arr.map((a: any) => ({ url: a.url, source: a.source }));
        });
        // tryCollect already appends; loop until we have enough or run out.
        if (results.length >= count) break;
        // If a full page yielded nothing new, stop to avoid an infinite loop.
        const before = results.length;
        await new Promise((r) => setTimeout(r, 300));
        page++;
        if (results.length === before && page > 1) break;
    }

    return results;
}

/** Direct download of a single explicit URL (image/video/music/sfx). */
export async function downloadDirectUrl(
    url: string,
    kind: 'image' | 'video' | 'music' | 'sfx',
    outDir: string,
    filename?: string,
): Promise<string | null> {
    fs.mkdirSync(outDir, { recursive: true });
    const ext = path.extname(url).split('?')[0] || (kind === 'video' ? '.mp4' : kind === 'image' ? '.jpg' : '.mp3');
    const name = filename ?? `${kind}_direct${ext}`;
    try {
        const r = await downloadMedia(url, outDir, name);
        if (r.path && fs.existsSync(r.path)) return r.path;
    } catch (e) {
        console.warn(`  ⚠ direct download failed for ${url}: ${(e as Error)?.message ?? e}`);
    }
    return null;
}
