/**
 * download-media.ts — standalone "fetch me an image/video for a keyword" op.
 *
 * Reuses the project's REAL free fetchers (fetchVisualsForScene / searchImages)
 * so a user can say "give me a picture of coffee" or "give me a video of a
 * city" and get back just the downloaded file — no full pipeline.
 *
 * ZERO-COST: Pexels/Pixabay/Wikimedia/Openverse — all free, no API key
 * required for the agent backend.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fetchVisualsForScene, searchImages } from '../../lib/visual-fetcher.js';
import { downloadMedia } from '../../lib/visual-fetcher.js';
import { withRetry } from './retry.js';

export interface MediaResult {
    ok: boolean;
    output?: string;
    source?: string;
    license?: string;
    detail: string;
}

function resolveOut(ext: string, baseName: string): string {
    const p = path.join(process.cwd(), 'output', `${baseName}_${Date.now()}.${ext}`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    return p;
}

async function tryDownload(url: string | undefined, dir: string, filename: string): Promise<string | null> {
    if (!url) return null;
    try {
        const r = await withRetry(() => downloadMedia(url, dir, filename), {
            retries: 3,
            label: `download:${filename}`,
        });
        return r.path;
    } catch {
        return null;
    }
}

/** Download ONE free image for a keyword. */
export async function downloadImageByKeyword(keyword: string, out?: string): Promise<MediaResult> {
    if (!keyword?.trim()) return { ok: false, detail: 'empty keyword' };
    const dir = out ? path.dirname(out) : path.join(process.cwd(), 'output');
    fs.mkdirSync(dir, { recursive: true });
    const filename = out ? path.basename(out) : `image_${Date.now()}.jpg`;

    // Try the shared ladder first (image).
    const variants = [keyword, `${keyword} photo`, `person ${keyword}`];
    for (const q of variants) {
        try {
            const r = await withRetry(() => fetchVisualsForScene([q], false, 'portrait'), {
                retries: 2,
                label: `fetchImg:${q}`,
            });
            const url = r && !Array.isArray(r) ? (r as any).url : Array.isArray(r) ? r[0]?.url : undefined;
            const p = await tryDownload(url, dir, filename);
            if (p) return { ok: true, output: p, source: 'openverse/pexels', detail: `image for "${keyword}" -> ${p}` };
        } catch {
            /* next variant */
        }
        try {
            const imgs = await withRetry(() => searchImages(q, 5, 1, 'portrait', 1), {
                retries: 2,
                label: `searchImg:${q}`,
            });
            if (imgs?.length) {
                const p = await tryDownload(imgs[0].url, dir, filename);
                if (p) return { ok: true, output: p, source: 'openverse', detail: `image for "${keyword}" -> ${p}` };
            }
        } catch {
            /* next variant */
        }
    }
    return { ok: false, detail: `no free image found for "${keyword}"` };
}

/** Download ONE free video for a keyword. */
export async function downloadVideoByKeyword(keyword: string, out?: string): Promise<MediaResult> {
    if (!keyword?.trim()) return { ok: false, detail: 'empty keyword' };
    const dir = out ? path.dirname(out) : path.join(process.cwd(), 'output');
    fs.mkdirSync(dir, { recursive: true });
    const filename = out ? path.basename(out) : `video_${Date.now()}.mp4`;

    const variants = [keyword, `${keyword} video`, `${keyword} footage`];
    for (const q of variants) {
        try {
            const r = await withRetry(() => fetchVisualsForScene([q], true, 'portrait'), {
                retries: 2,
                label: `fetchVid:${q}`,
            });
            const url = r && !Array.isArray(r) ? (r as any).url : Array.isArray(r) ? r[0]?.url : undefined;
            const p = await tryDownload(url, dir, filename);
            if (p) return { ok: true, output: p, source: 'openverse/pexels', detail: `video for "${keyword}" -> ${p}` };
        } catch {
            /* next variant */
        }
    }
    return { ok: false, detail: `no free video found for "${keyword}"` };
}
