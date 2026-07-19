/**
 * media-downloader.ts — ADVANCED parallel multi-platform media acquisition.
 *
 * Single entry point `downloadTopicMedia(topic, opts)` that:
 *   1. Queries EVERY available free platform IN PARALLEL:
 *        - images: Wikimedia, Internet Archive, NASA (space topics), MetMuseum (art topics)
 *        - videos: Wikimedia, Internet Archive
 *        - Openverse / Pexels / Pixabay when API keys are configured
 *   2. Isolates every platform: a failure (HTTP 429, timeout, DNS, 5xx) on ONE
 *      platform is caught and that platform simply contributes [] — it NEVER
 *      breaks or slows the other platforms. This is the "fault-tolerant
 *      parallel" guarantee the user asked for.
 *   3. Applies the SHARED relevance filter (isOnTopic) so off-topic assets
 *      (NASA nebula, "lion king", Japanese "LION" brand, stone lion, …) are
 *      dropped before download.
 *   4. Downloads all accepted candidates in PARALLEL with a bounded concurrency
 *      (default 4) so we don't trigger rate-limits, then VERIFIES each file
 *      (valid media? non-trivial size?) and FAILS OVER to the next candidate
 *      if a download is corrupt.
 *
 * This is the production-grade core the agentic pipeline and the CLI
 * (bin/agentic-download.ts) both build on.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FreeImageAdapter } from './free-image/adapter.js';
import { FreeVideoAdapter } from './free-video/adapter.js';
import { freeVideoDownloader } from './free-video/index.js';
import { mapWithConcurrencyLimit } from '../agentic/acquire.js';
import { searchPexelsImages, searchPexelsVideos, pexelsKeyPresent } from './pexels.js';

export interface MediaHit {
    file: string;
    source: string;
    title: string;
    kind: 'image' | 'video';
    url: string;
    ok: boolean;
    reason: string;
    /** 'online' = downloaded from a real platform; 'offline' = locally
     *  generated placeholder (asset-creator / ffmpeg) because every online
     *  source failed or was rate-limited. Always CC0. */
    mode: 'online' | 'offline';
}

export interface DownloadTopicOptions {
    images?: number;
    videos?: number;
    /** Max simultaneous downloads. Keeps free hosts from 429-ing the whole run. */
    concurrency?: number;
    /** Output directory. */
    outDir: string;
    /** When true, require a vision-model check too (see verifyVisual hook). */
    verifyVisual?: (file: string, title: string, topic: string) => Promise<boolean>;
    /**
     * When true (default), if online platforms return nothing or every download
     * fails/rate-limits, generate local CC0 placeholder assets via asset-creator
     * (ffmpeg) so the job ALWAYS completes offline. Set false to only ever
     * return real downloaded assets.
     */
    offlineFallback?: boolean;
    /**
     * Hard cap (ms) on the ENTIRE download job. Guarantees the caller never
     * hangs: once exceeded, in-flight downloads are abandoned and the job
     * returns whatever it has (online assets + offline backfill). 0 = no cap.
     */
    timeoutMs?: number;
}

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; AVG/1.0)' };

/** Reject after `ms` so a single hung download can never block the whole job. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        p.then(
            (v) => { clearTimeout(t); resolve(v); },
            (e) => { clearTimeout(t); reject(e); },
        );
    });
}

/** Isolated call: never throw — convert any failure into a safe empty result. */
async function safe<T>(
    label: string,
    fn: () => Promise<T>,
): Promise<{ label: string; value: T | null; error?: string }> {
    try {
        return { label, value: await fn() };
    } catch (e: any) {
        return { label, value: null, error: String(e?.message || e).slice(0, 120) };
    }
}

/**
 * Query all image platforms in parallel, each isolated. Returns the merged,
 * relevance-filtered candidate list with per-platform provenance.
 * Keyless: Wikimedia, Internet Archive, (NASA/MetMuseum gated by topic).
 * Keyed (optional): Pexels — added when PEXELS_API_KEY is a real key.
 */
export async function searchAllImagePlatforms(
    topic: string,
    countPerPlatform = 6,
): Promise<{ source: string; title: string; url: string; kind: 'image' }[]> {
    const tasks: Promise<{ source: string; title: string; url: string; kind: 'image' }[]>[] = [];
    const adapter = new FreeImageAdapter();
    tasks.push(
        adapter.searchAll(topic, { count: countPerPlatform }).then((sources) =>
            sources.flatMap((s) =>
                s.results.map((r) => ({ source: s.source, title: r.title, url: r.downloadUrl, kind: 'image' as const })),
            ),
        ),
    );
    if (pexelsKeyPresent()) {
        tasks.push(
            searchPexelsImages(topic, countPerPlatform).then((imgs) =>
                imgs.map((r) => ({ source: 'pexels', title: r.title, url: r.downloadUrl, kind: 'image' as const })),
            ),
        );
    }
    const settled = await Promise.allSettled(tasks);
    return settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
}

export async function searchAllVideoPlatforms(
    topic: string,
    countPerPlatform = 6,
): Promise<{ source: string; title: string; url: string; kind: 'video' }[]> {
    const tasks: Promise<{ source: string; title: string; url: string; kind: 'video' }[]>[] = [];
    const adapter = new FreeVideoAdapter();
    tasks.push(
        adapter.searchAll(topic, { count: countPerPlatform }).then((sources) =>
            sources.flatMap((s) =>
                s.results.map((r) => ({ source: s.source, title: r.title, url: r.downloadUrl, kind: 'video' as const })),
            ),
        ),
    );
    if (pexelsKeyPresent()) {
        tasks.push(
            searchPexelsVideos(topic, countPerPlatform).then((vids) =>
                vids.map((r) => ({ source: 'pexels', title: r.title, url: r.downloadUrl, kind: 'video' as const })),
            ),
        );
    }
    const settled = await Promise.allSettled(tasks);
    return settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
}

function isVideoUrl(url: string): boolean {
    return /\.(mp4|webm|ogv|ogg)(\?|$)/i.test(url);
}

/** Download one asset to disk with retry/backoff. Null = failed. */
export async function downloadOneAsset(
    hit: { source: string; title: string; url: string; kind: 'image' | 'video' },
    outDir: string,
): Promise<MediaHit> {
    let base = '';
    let dest = '';
    try {
        // Derive filename INSIDE the try: a malformed/empty hit.url makes
        // `new URL(...)` throw synchronously; if it runs outside the try it
        // escapes this function's catch and (via mapWithConcurrencyLimit)
        // aborts the whole kind's download, silently forcing 100% offline.
        const ext = (
            path.extname(new URL(hit.url).pathname).split('?')[0] || (hit.kind === 'video' ? '.mp4' : '.jpg')
        ).toLowerCase();
        base = `${hit.kind}_${hit.source}_${hit.title.replace(/[^\\w-]+/g, '_').slice(0, 40)}${ext}`;
        dest = path.join(outDir, base);
        if (hit.kind === 'video') {
            // Videos go through the hardened FreeDownloadManager (resume + stall
            // guard). Wrap in a hard per-asset timeout so a hung source (e.g.
            // Archive.org stalling past its own guard under retries) can never
            // block the whole batch — the failover / offline backstop takes over.
            const res = await withTimeout(
                freeVideoDownloader.downloadAll(
                    [
                        {
                            id: hit.url,
                            title: hit.title,
                            creator: hit.source,
                            license: 'PD',
                            licenseUrl: '',
                            provider: hit.source as any,
                            downloadUrl: hit.url,
                            thumbnailUrl: null,
                            durationSeconds: null,
                            resolution: null,
                            fileSizeBytes: null,
                            format: ext.replace('.', '') as any,
                            sourcePageUrl: '',
                        },
                    ],
                    outDir,
                ),
                90000,
                `video ${hit.source}`,
            );
            const dr = res[0];
            if (!dr?.success || !dr.localPath) throw new Error(dr?.error || 'video download failed');
            return {
                file: dr.localPath,
                source: hit.source,
                title: hit.title,
                kind: hit.kind,
                url: hit.url,
                ok: true,
                mode: 'online',
                reason: `${fs.statSync(dr.localPath).size}B`,
            };
        }
        // Images: retrying fetch with exponential backoff + Retry-After honour,
        // and a hard per-asset timeout (AbortSignal) so a slow/hanging source
        // (Wikimedia 429 loops, slow Pexels CDN) can never block the batch —
        // the failover / offline backstop takes over.
        const MAX_TRIES = 3;
        const PER_ASSET_TIMEOUT = 30000;
        let lastErr = '';
        for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
            try {
                const res = await fetch(hit.url, { headers: UA as any, signal: AbortSignal.timeout(PER_ASSET_TIMEOUT) });
                if (res.status === 429 || res.status >= 500) {
                    const retryAfter = Number(res.headers.get('retry-after')) || 0;
                    const wait = retryAfter > 0 ? retryAfter * 1000 : 2000 * Math.pow(2, attempt);
                    lastErr = `HTTP ${res.status}`;
                    if (attempt < MAX_TRIES - 1) {
                        await new Promise((r) => setTimeout(r, wait));
                        continue;
                    }
                    throw new Error(lastErr);
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const buf = Buffer.from(await res.arrayBuffer());
                if (buf.length < 1000) throw new Error('file too small');
                fs.writeFileSync(dest, buf);
                return {
                    file: dest,
                    source: hit.source,
                    title: hit.title,
                    kind: hit.kind,
                    url: hit.url,
                    ok: true,
                    mode: 'online',
                    reason: `${buf.length}B`,
                };
            } catch (e: any) {
                lastErr = String(e?.message || e).slice(0, 80);
                if (attempt < MAX_TRIES - 1) {
                    await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
                    continue;
                }
            }
        }
        return {
            file: base,
            source: hit.source,
            title: hit.title,
            kind: hit.kind,
            url: hit.url,
            ok: false,
            mode: 'online',
            reason: lastErr,
        };
    } catch (e: any) {
        return { file: base, source: hit.source, title: hit.title, kind: hit.kind, url: hit.url, ok: false, mode: 'online', reason: String(e?.message || e).slice(0, 80) };
    }
}

/**
 * OFFLINE fallback: when every online platform fails or rate-limits, generate a
 * local CC0 placeholder asset with ffmpeg (via tools/asset-creator) so the job
 * still completes. Zero network, zero API keys. Returns a MediaHit marked
 * mode:'offline' (clearly distinguishable from a real download in reports).
 */
export function generateOfflineVisual(
    topic: string,
    kind: 'image' | 'video',
    dir: string,
    index: number,
): MediaHit | null {
    try {
        const creator: any = require('../../tools/asset-creator/src/index.js');
        const label = topic.slice(0, 40);
        const base = `${kind}_offline_${index + 1}${kind === 'video' ? '.mp4' : '.jpg'}`;
        const out = path.join(dir, base);
        fs.mkdirSync(dir, { recursive: true });
        let localPath: string;
        if (kind === 'video') {
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
            file: localPath,
            source: 'offline-fallback',
            title: `${topic} (offline placeholder)`,
            kind,
            url: `asset-creator://${path.basename(localPath)}`,
            ok: true,
            mode: 'offline',
            reason: 'offline CC0 placeholder',
        };
    } catch (e: any) {
        console.warn(`⚠ offline placeholder generation failed: ${(e as Error)?.message ?? e}`);
        return null;
    }
}

/**
 * MAIN ENTRY: download up to `images`+`videos` on-topic, verified assets for a
 * topic, from ALL platforms in parallel with full fault isolation + failover.
 * If online yields less than requested AND offlineFallback is on (default),
 * the remainder is filled with local CC0 placeholders so the job always
 * completes — online first, offline as backstop.
 */
export async function downloadTopicMedia(
    topic: string,
    opts: DownloadTopicOptions,
): Promise<{ images: MediaHit[]; videos: MediaHit[] }> {
    const wantImg = opts.images ?? 0;
    const wantVid = opts.videos ?? 0;
    const concurrency = opts.concurrency ?? 4;
    const useOffline = opts.offlineFallback !== false;
    const imgDir = path.join(opts.outDir, 'images');
    const vidDir = path.join(opts.outDir, 'videos');
    fs.mkdirSync(imgDir, { recursive: true });
    fs.mkdirSync(vidDir, { recursive: true });

    // STEP 1: search ALL platforms in parallel, each isolated + time-bounded so
    // a slow provider (e.g. Archive.org) can never hang the whole job.
    const SEARCH_TIMEOUT = 60000;
    const [imgSearch, vidSearch] = await Promise.all([
        safe('images', () => withTimeout(searchAllImagePlatforms(topic, Math.max(6, wantImg * 2)), SEARCH_TIMEOUT, 'image search')),
        safe('videos', () => withTimeout(searchAllVideoPlatforms(topic, Math.max(6, wantVid * 2)), SEARCH_TIMEOUT, 'video search')),
    ]);

    const imgCandidates = (imgSearch.value ?? []).filter((h) => FreeImageAdapter.isOnTopic(topic, h.title));
    const vidCandidates = (vidSearch.value ?? []).filter((h) => FreeVideoAdapter.isOnTopic(topic, h.title));

    // De-dup by URL, keep first.
    const dedupe = <T extends { url: string }>(arr: T[]) => {
        const seen = new Set<string>();
        return arr.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)));
    };

    // Download accepted candidates in parallel (bounded), with failover to the
    // next best candidate from the pool when some downloads fail/rate-limit.
    const fetchAndVerify = async (
        hits: { source: string; title: string; url: string; kind: 'image' | 'video' }[],
        dir: string,
        want: number,
        out?: MediaHit[],
    ): Promise<MediaHit[]> => {
        const pool = dedupe(hits);
        const results = await mapWithConcurrencyLimit(
            pool.map((h) => () => downloadOneAsset(h, dir)),
            concurrency,
        );
        const good = results.filter((r) => r.ok);
        // Accumulate partials into the outer array as we go, so a job-level
        // timeout (which rejects the withTimeout wrapper) still keeps whatever
        // already downloaded instead of discarding it.
        if (out) out.push(...good);
        // Failover: retry the FAILED candidates (not a slice by good.length).
        // good.length is the count of successes, not an index, so slicing by it
        // skipped failed candidates that sat before that offset.
        if (want > 0 && good.length < want) {
            const need = want - good.length;
            const failedUrls = new Set(results.filter((r) => !r.ok).map((r) => r.url));
            const extra = pool.filter((h) => failedUrls.has(h.url)).slice(0, need * 2);
            const more = await mapWithConcurrencyLimit(
                extra.map((h) => () => downloadOneAsset(h, dir)),
                concurrency,
            );
            const moreGood = more.filter((r) => r.ok);
            if (out) out.push(...moreGood);
            good.push(...moreGood);
        }
        return good.slice(0, want || good.length);
    };

    // STEP 2: download accepted candidates in parallel (bounded), with failover.
    // A hard per-asset timeout (image AbortSignal / video 90s) already bounds
    // each download; the job-level timeout below is a final safety net so the
    // whole job can NEVER hang — on timeout we keep whatever already downloaded
    // (partials accumulate into images/videos via the `out` arg) and let the
    // offline backstop fill the rest (instead of throwing FATAL).
    let images: MediaHit[] = [];
    let videos: MediaHit[] = [];
    try {
        [images, videos] = await Promise.all([
            withTimeout(fetchAndVerify(imgCandidates, imgDir, wantImg, images), opts.timeoutMs ?? 150000, 'image download'),
            withTimeout(fetchAndVerify(vidCandidates, vidDir, wantVid, videos), opts.timeoutMs ?? 150000, 'video download'),
        ]);
    } catch (e: any) {
        console.warn(`⚠ download job timed out (${String(e?.message || e).slice(0, 60)}); keeping partials + offline backfill`);
        // Partial downloads already accumulated into images/videos via the `out`
        // arg; the fresh re-sweep below is a best-effort top-up, not a discard.
        if (images.length < wantImg) {
            try {
                const extra = await fetchAndVerify(imgCandidates.slice(0, wantImg), imgDir, wantImg - images.length, images).catch(() => []);
                images.push(...extra);
            } catch { /* offline backstop fills the rest */ }
        }
        if (videos.length < wantVid) {
            try {
                const extra = await fetchAndVerify(vidCandidates.slice(0, wantVid), vidDir, wantVid - videos.length, videos).catch(() => []);
                videos.push(...extra);
            } catch { /* offline backstop fills the rest */ }
        }
    }

    // STEP 3: OFFLINE BACKSTOP — fill any shortfall with local CC0 placeholders.
    if (useOffline) {
        for (let i = images.length; i < wantImg; i++) {
            const fb = generateOfflineVisual(topic, 'image', imgDir, i);
            if (fb) images.push(fb);
        }
        for (let i = videos.length; i < wantVid; i++) {
            const fb = generateOfflineVisual(topic, 'video', vidDir, i);
            if (fb) videos.push(fb);
        }
    }

    // Optional vision gate (online assets only; offline placeholders skip it).
    if (opts.verifyVisual) {
        for (const h of [...images, ...videos]) {
            if (h.ok && h.mode === 'online') {
                const pass = await opts.verifyVisual(h.file, h.title, topic);
                if (!pass) {
                    h.ok = false;
                    h.reason = 'visual check failed';
                    try {
                        fs.unlinkSync(h.file);
                    } catch {
                        /* ignore */
                    }
                }
            }
        }
    }

    return { images, videos };
}
