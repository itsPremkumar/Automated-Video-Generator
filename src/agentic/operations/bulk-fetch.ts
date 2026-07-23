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
import { searchImages, searchVideos, fetchVisualsForScene, downloadMedia } from '../../lib/visual-fetcher/index.js';

export interface BulkFetchOptions {
    orientation?: 'portrait' | 'landscape' | 'square' | '';
    kind?: 'image' | 'video';
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
                if (r.path && fs.existsSync(r.path)) results.push(r.path);
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
    let page = 0;
    while (results.length < count && page < 8) {
        const more = await tryCollect(async () => {
            const res = await fetchVisualsForScene([query], kind === 'video', (orientation || 'portrait') as any, undefined, page * count);
            const arr = !res ? [] : Array.isArray(res) ? res : [res];
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
