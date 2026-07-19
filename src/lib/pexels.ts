/**
 * pexels.ts — optional KEYED platform for the parallel media-downloader.
 *
 * Pexels requires a free API key (https://www.pexels.com/api/). It is NOT a
 * "free/no-key" source like Wikimedia, so it lives separately and is only
 * queried when PEXELS_API_KEY is set to a REAL key (the repo's placeholder
 * `your_pexels_api_key_here` is detected and skipped). When a real key is
 * present, Pexels is queried IN PARALLEL with the keyless platforms — it just
 * adds more on-topic candidates to the pool (higher quality, less rate-limited).
 *
 * Every call is isolated (thrown errors become []), matching the fault-tolerant
 * contract of searchAllImagePlatforms / searchAllVideoPlatforms.
 */
import { ImageResult } from './free-image/models.js';
import { VideoResult } from './free-video/models.js';

const PLACEHOLDER = 'your_pexels_api_key_here';

export function pexelsKeyPresent(): boolean {
    const k = (process.env.PEXELS_API_KEY || '').trim();
    return k.length > 0 && k !== PLACEHOLDER;
}

async function pexelsGet(path: string, params: Record<string, string | number>): Promise<any> {
    const key = process.env.PEXELS_API_KEY!.trim();
    const url = new URL(`https://api.pexels.com${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetch(url.toString(), { headers: { Authorization: key } });
    if (!res.ok) throw new Error(`Pexels ${path} HTTP ${res.status}`);
    return res.json();
}

/** Search Pexels for on-topic images. Returns [] on any failure. */
export async function searchPexelsImages(keyword: string, count: number): Promise<ImageResult[]> {
    try {
        const data = await pexelsGet('/v1/search', { query: keyword, per_page: Math.min(count, 40), page: 1 });
        const photos: any[] = data.photos ?? [];
        return photos.slice(0, count).map((p) => ({
            id: `pexels-${p.id}`,
            title: p.alt?.trim() || p.url,
            creator: p.photographer || 'Pexels',
            license: 'Pexels License (free for commercial use)',
            licenseUrl: 'https://www.pexels.com/license/',
            provider: 'pexels',
            downloadUrl: p.src?.large2x || p.src?.large || p.src?.original,
            thumbnailUrl: p.src?.tiny || null,
            width: p.width ?? null,
            height: p.height ?? null,
            fileSizeBytes: null,
            sourcePageUrl: p.url,
        }));
    } catch (e) {
        return [];
    }
}

/** Search Pexels for on-topic videos. Returns [] on any failure. */
export async function searchPexelsVideos(keyword: string, count: number): Promise<VideoResult[]> {
    try {
        const data = await pexelsGet('/videos/search', { query: keyword, per_page: Math.min(count, 40), page: 1 });
        const vids: any[] = data.videos ?? [];
        const out: VideoResult[] = [];
        for (const v of vids.slice(0, count)) {
            const files: any[] = v.video_files ?? [];
            // pick the highest-resolution mp4
            const mp4 = files
                .filter((f) => (f.file_type || '').includes('mp4'))
                .sort((a, b) => (b.width || 0) - (a.width || 0))[0];
            if (!mp4) continue;
            out.push({
                id: `pexels-${v.id}`,
                title: v.url,
                creator: v.user?.name || 'Pexels',
                license: 'Pexels License (free for commercial use)',
                licenseUrl: 'https://www.pexels.com/license/',
                provider: 'pexels',
                downloadUrl: mp4.link,
                thumbnailUrl: v.image || null,
                durationSeconds: v.duration ?? null,
                resolution: mp4.width ? `${mp4.width}x${mp4.height}` : null,
                fileSizeBytes: mp4.file_size ?? null,
                format: 'mp4',
                sourcePageUrl: v.url,
            });
        }
        return out;
    } catch (e) {
        return [];
    }
}
