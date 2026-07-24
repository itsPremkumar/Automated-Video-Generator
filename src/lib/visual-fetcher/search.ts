import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'node:child_process';
import { logInfo, resolveProjectPath } from '../../runtime';
import { ffmpegPath } from '../ffmpeg';
import { generateContent as ollamaGenerateContent } from '../ollama-client';
import { searchOpenverseImages } from '../openverse-fetcher';
import { freeVideoDownloader, freeVideoAdapter } from '../free-video/index';
import { freeImageAdapter } from '../free-image/index';
import { isSafeUrl } from '../net-safety';
import { MediaAsset, VideoCache } from './types';
import {
    getCache, saveCache,
    buildCacheKey, buildLegacyCacheKey,
} from './cache';
import {
    sleep,
    getQualityRank, selectBestVideoFile, sortVideoAssets,
    MIN_WIDTH, TARGET_VIDEO_DURATION_SECONDS,
} from './media-utils';
import {
    normalizeKeywordList, parseGeminiKeywordResponse,
    shouldRetryGeminiRequest, formatGeminiError,
    geminiWaitQueue, ollamaWaitQueue,
} from './keyword-utils';

const console = {
    log: (...args: unknown[]) => logInfo(...args),
};

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = Math.max(5000, Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '30000', 10) || 30000);
const GEMINI_MAX_RETRIES = Math.max(1, Number.parseInt(process.env.GEMINI_MAX_RETRIES || '3', 10) || 3);
const GEMINI_MAX_CONCURRENCY = Math.max(1, Number.parseInt(process.env.GEMINI_MAX_CONCURRENCY || '2', 10) || 2);
const OLLAMA_MAX_CONCURRENCY = Math.max(1, Number.parseInt(process.env.OLLAMA_MAX_CONCURRENCY || '2', 10) || 2);
const RAW_AI_PROVIDER = process.env.AI_PROVIDER;
const AI_PROVIDER = RAW_AI_PROVIDER !== undefined ? RAW_AI_PROVIDER.trim().toLowerCase() || '' : 'ollama';
// Live check (not a captured const) so tests can disable Openverse at runtime
// via OPENVERSE_ENABLED=false without re-importing the module.
function openverseEnabled(): boolean {
    return process.env.OPENVERSE_ENABLED !== 'false';
}
const MEDIA_VERIFICATION_ENABLED = process.env.MEDIA_VERIFICATION_ENABLED !== 'false';

const BASE_URL = 'https://api.pexels.com/v1';
const getPexelsApiKey = () => process.env.PEXELS_API_KEY || '';
const getGeminiApiKey = () => process.env.GEMINI_API_KEY || '';
const getPixabayApiKey = () => process.env.PIXABAY_API_KEY || '';

// ========================================================================
// Gemini keyword optimization (shared between search and fetchVisualsForScene)
// ========================================================================

async function executeWithConcurrencyLimit<T>(
    queue: Array<() => void>,
    maxConcurrency: number,
    fn: () => Promise<T>,
): Promise<T> {
    if (maxConcurrency <= 0) return fn();
    return new Promise<T>((resolve, reject) => {
        const run = async () => {
            try {
                resolve(await fn());
            } catch (e) {
                reject(e);
            } finally {
                const next = queue.shift();
                if (next) next();
            }
        };
        if (queue.length < maxConcurrency) {
            run();
        } else {
            queue.push(run);
        }
    });
}

export async function optimizeKeywordsWithGemini(
    sceneText: string,
    defaultKeywords: string[],
): Promise<string[]> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) return defaultKeywords;

    try {
        const response = await executeWithConcurrencyLimit(geminiWaitQueue, GEMINI_MAX_CONCURRENCY, async () => {
            let lastError: unknown;
            for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt++) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
                    const res = await axios.post(
                        url,
                        {
                            contents: [{
                                parts: [{
                                    text: `Given this scene narration, return 3-5 specific visual search keywords (comma-separated, lowercase, no quotes).\nScene: "${sceneText}"\nKeywords:`,
                                }],
                            }],
                        },
                        { signal: controller.signal, timeout: GEMINI_TIMEOUT_MS },
                    );
                    clearTimeout(timeoutId);
                    const text = res?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    const keywords = text ? normalizeKeywordList(text) : defaultKeywords;
                    return keywords.length > 0 ? keywords : defaultKeywords;
                } catch (error: unknown) {
                    lastError = error;
                    if (shouldRetryGeminiRequest(error)) {
                        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                        await sleep(delay);
                        continue;
                    }
                    throw error;
                }
            }
            console.log(`Gemini keyword optimization failed after ${GEMINI_MAX_RETRIES} retries: ${formatGeminiError(lastError)}`);
            return defaultKeywords;
        });
        return response;
    } catch {
        return defaultKeywords;
    }
}

// ========================================================================
// Pexels search — videos (★ RECOMMENDED PROVIDER)
// ========================================================================

const PEXELS_VIDEO_URL = 'https://api.pexels.com/videos/search';
const PEXELS_PHOTO_URL = 'https://api.pexels.com/v1/search';

/** Log a prominent recommendation message once. */
let _pexelsRecommendedLogged = false;
function logPexelsRecommended(): void {
    if (_pexelsRecommendedLogged) return;
    _pexelsRecommendedLogged = true;
    console.log('');
    console.log('★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★');
    console.log('★  PEXELS is the RECOMMENDED primary media provider.');
    console.log('★  Stable, high-quality images & videos with API key.');
    console.log('★  Free sources (Openverse, Wikimedia) are fallback only.');
    console.log('★  Get a free API key: https://www.pexels.com/api/');
    console.log('★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★  ★');
    console.log('');
}

export async function searchVideos(
    query: string,
    count: number = 15,
    page: number = 1,
    orientation: 'portrait' | 'landscape' | 'square' | '' = '',
): Promise<MediaAsset[]> {
    const apiKey = getPexelsApiKey();
    if (!apiKey) {
        console.log('⚠ [PEXELS] No API key set — skipping Pexels video search. Free sources will be used as fallback.');
        console.log('  💡 Get a free Pexels API key at https://www.pexels.com/api/ for better results.');
        return [];
    }
    logPexelsRecommended();

    try {
        const params: Record<string, string | number> = {
            query,
            per_page: Math.min(count, 80),
            page,
        };
        if (orientation) params.orientation = orientation;

        const response = await axios.get(PEXELS_VIDEO_URL, {
            headers: { Authorization: apiKey },
            params,
            timeout: 15000,
        });

        const videos: MediaAsset[] = (response.data?.videos || []).map((v: any) => {
            const videoFile = selectBestVideoFile(
                (v.video_files || []).map((f: any) => ({
                    type: 'video' as const,
                    url: f.link,
                    width: f.width || 0,
                    height: f.height || 0,
                    photographer: v.user?.name || v.photographer || undefined,
                })),
            );

            return {
                type: 'video',
                url: videoFile?.url || '',
                width: videoFile?.width || v.width || 0,
                height: videoFile?.height || v.height || 0,
                photographer: videoFile?.photographer || v.photographer || undefined,
                videoDuration: v.duration || TARGET_VIDEO_DURATION_SECONDS,
            };
        });

        return videos.filter((v) => v.url && v.width >= MIN_WIDTH);
    } catch (error: any) {
        if (error?.response?.status === 429) {
            console.log('⚠ [PEXELS] Rate limited (429), retrying after 5s…');
            await sleep(5000);
            return searchVideos(query, count, page, orientation);
        }
        console.log(`⚠ [PEXELS] Video search error: ${error?.message || error}`);
        return [];
    }
}

// ========================================================================
// Pexels search — images (★ RECOMMENDED PROVIDER)
// ========================================================================

export async function searchImages(
    query: string,
    count: number = 15,
    page: number = 1,
    orientation: 'portrait' | 'landscape' | 'square' | '' = '',
    minWidth?: number,
): Promise<MediaAsset[]> {
    const apiKey = getPexelsApiKey();
    if (!apiKey) {
        console.log('⚠ [PEXELS] No API key set — skipping Pexels image search. Free sources will be used as fallback.');
        return [];
    }
    logPexelsRecommended();

    try {
        const params: Record<string, string | number> = {
            query,
            per_page: Math.min(count, 80),
            page,
        };
        if (orientation) params.orientation = orientation;

        const response = await axios.get(PEXELS_PHOTO_URL, {
            headers: { Authorization: apiKey },
            params,
            timeout: 15000,
        });

        let photos = (response.data?.photos || response.data?.media || []).map((p: any) => ({
            type: 'image' as const,
            url: p.src?.original || p.src?.large || p.src?.medium || '',
            width: p.width || 0,
            height: p.height || 0,
            photographer: p.photographer || p.user?.name || undefined,
        }));

        if (minWidth) {
            photos = photos.filter((p: any) => p.width >= minWidth);
        }

        return photos;
    } catch (error: any) {
        if (error?.response?.status === 429) {
            await sleep(5000);
            return searchImages(query, count, page, orientation, minWidth);
        }
        return [];
    }
}

// ========================================================================
// Retry helper — exponential backoff for transient network blips
// ========================================================================

export async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            if (attempt < maxAttempts - 1) {
                const delay = Math.min(800 * Math.pow(2, attempt), 5000);
                console.log(`  ↻ [RETRY ${attempt + 1}/${maxAttempts}] ${label} failed, waiting ${delay}ms…`);
                await sleep(delay);
            }
        }
    }
    throw lastError;
}

// ========================================================================
// Free image search (Openverse, Wikimedia, etc.) — FALLBACK only
// ========================================================================

export async function searchFreeImages(
    query: string,
    count: number = 8,
): Promise<MediaAsset[]> {
    const results: MediaAsset[] = [];

    // Openverse via our fetcher — retry on transient blips so a single
    // network hiccup doesn't drop the whole scene (zero-cost/no-key path).
    if (openverseEnabled()) {
        try {
            const openverse = await withRetry(() => searchOpenverseImages(query, count), `openverse:${query}`);
            for (const img of openverse) {
                results.push({
                    type: 'image',
                    url: img.url,
                    width: img.width || 0,
                    height: img.height || 0,
                    photographer: img.photographer || undefined,
                });
            }
        } catch (e) {
            console.log(`⚠ [OPENVERSE] Search error after retries: ${(e as Error).message}`);
        }
    }

    // FreeImageAdapter (Wikimedia, Archive, etc.) — same retry guard.
    try {
        const sourceResults = await withRetry(
            () => freeImageAdapter.searchAll(query, { count: Math.max(1, count - results.length) }),
            `free-image:${query}`,
        );
        for (const sr of sourceResults) {
            for (const img of sr.results) {
                results.push({
                    type: 'image',
                    url: img.downloadUrl,
                    width: img.width || 0,
                    height: img.height || 0,
                    photographer: img.creator || img.provider || undefined,
                });
            }
        }
    } catch (e) {
        console.log(`⚠ [FREE-IMAGE] Search error after retries: ${(e as Error).message}`);
    }

    if (results.length > 0) {
        console.log(`  ⚡ FALLBACK: Got ${results.length} image(s) from free sources (Openverse/Wikimedia).`);
    }

    return results;
}

// ========================================================================
// Pixabay video search — SECONDARY fallback
// ========================================================================

export async function searchPixabayVideos(
    query: string,
    count: number = 15,
    orientation: 'portrait' | 'landscape' | 'all' = 'all',
): Promise<MediaAsset[]> {
    const apiKey = getPixabayApiKey();
    if (!apiKey) return [];

    try {
        const params: Record<string, string | number | boolean> = {
            key: apiKey,
            q: encodeURIComponent(query),
            per_page: Math.min(count, 200),
            safesearch: true,
        };
        if (orientation === 'portrait') params.orientation = 'vertical';

        const response = await axios.get('https://pixabay.com/api/videos/', {
            params,
            timeout: 15000,
        });

        const hits = response.data?.hits || [];
        const videos: MediaAsset[] = hits.map((hit: any) => {
            const videos = hit.videos || {};
            const sizes = ['large', 'medium', 'small', 'tiny'];
            let bestUrl = '';
            let bestWidth = 0;
            let bestHeight = 0;
            for (const size of sizes) {
                const v = videos[size];
                if (v?.url) {
                    bestUrl = v.url;
                    bestWidth = v.width || 0;
                    bestHeight = v.height || 0;
                    break;
                }
            }
            return {
                type: 'video',
                url: bestUrl,
                width: bestWidth,
                height: bestHeight,
                photographer: hit.user || undefined,
                videoDuration: hit.duration || TARGET_VIDEO_DURATION_SECONDS,
            };
        });

        return videos.filter((v) => v.url && v.width >= MIN_WIDTH);
    } catch (error: any) {
        if (error?.response?.status === 429) {
            await sleep(5000);
            return searchPixabayVideos(query, count, orientation);
        }
        return [];
    }
}

// ========================================================================
// fetchVisualsForScene — Pexels primary, free sources as fallback
// ========================================================================

export async function fetchVisualsForScene(
    keywords: string[],
    preferVideo: boolean,
    orientation: 'portrait' | 'landscape' | 'none' | 'square' = 'portrait',
    _outputDir?: string,
    resultIndex: number = 0,
): Promise<MediaAsset | MediaAsset[] | null> {
    if (!keywords || keywords.length === 0) return null;

    // 'square' is a valid final-frame aspect but the cache-key helpers and
    // free-source adapters only understand portrait/landscape/none. Coerce it
    // for those internal uses; Pexels searchVideos/searchImages below accept
    // 'square' natively and get the original value.
    const cacheOrientation = orientation === 'square' ? 'portrait' : orientation;
    const query = keywords.join(' ');
    const cacheKey = `${buildCacheKey(query, cacheOrientation, preferVideo ? 'video' : 'image')}_r${resultIndex}`;
    const legacyCacheKey = buildLegacyCacheKey(query, cacheOrientation);

    const cache = getCache();

    // Legacy migration: if only the old non-resultIndex cache key exists, copy it
    const legacyCachedAsset = cache[legacyCacheKey];
    if (legacyCachedAsset?.type === (preferVideo ? 'video' : 'image')) {
        cache[cacheKey] = legacyCachedAsset;
        saveCache(cache);
    }

    if (cache[cacheKey]) {
        return cache[cacheKey];
    }

    // Deduplicate individual queries
    const individualQueries = [...new Set(
        keywords.map((k) => k.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()).filter(Boolean),
    )];

    const queriesToTry = individualQueries.length > 0 ? individualQueries : [query];
    const hasPexelsKey = !!getPexelsApiKey();

    if (hasPexelsKey) {
        logPexelsRecommended();
    }

    for (const q of queriesToTry) {
        try {
            // ── PEXELS (★ RECOMMENDED PRIMARY) ──────────────────────────
            if (hasPexelsKey) {
                if (preferVideo) {
                    const videos = await searchVideos(q, 15, 1, orientation === 'none' ? '' : orientation);
                    if (videos.length > 0) {
                        const pickIndex = Math.min(resultIndex, videos.length - 1);
                        const pick = videos[pickIndex];
                        if (pick && pick.url) {
                            console.log(`  ★ [PEXELS] Selected video candidate #${pickIndex + 1} for "${q}"`);
                            cache[cacheKey] = pick;
                            saveCache(cache);
                            return pick;
                        }
                    }
                    console.log(`  ⚠ [PEXELS] No video results for "${q}" — trying fallback sources…`);
                } else {
                    const images = await searchImages(q, 15, 1, orientation === 'none' ? '' : orientation);
                    if (images.length > 0) {
                        const pickIndex = Math.min(resultIndex, images.length - 1);
                        const pick = images[pickIndex];
                        if (pick && pick.url) {
                            console.log(`  ★ [PEXELS] Selected image candidate #${pickIndex + 1} for "${q}"`);
                            cache[cacheKey] = pick;
                            saveCache(cache);
                            return pick;
                        }
                    }
                    console.log(`  ⚠ [PEXELS] No image results for "${q}" — trying fallback sources…`);
                }
            }

            // ── PIXABAY (secondary fallback) ────────────────────────────
            if (preferVideo) {
                const pixabayVideos = await searchPixabayVideos(q, 15, orientation === 'none' ? 'all' : orientation as any);
                if (pixabayVideos.length > 0) {
                    const pickIndex = Math.min(resultIndex, pixabayVideos.length - 1);
                    const pick = pixabayVideos[pickIndex];
                    if (pick && pick.url) {
                        console.log(`  ⚡ FALLBACK [Pixabay] Selected video candidate #${pickIndex + 1} for "${q}"`);
                        cache[cacheKey] = pick;
                        saveCache(cache);
                        return pick;
                    }
                }
            }

            // ── FREE VIDEO SOURCES (last resort fallback) ────────────────
            if (preferVideo) {
                try {
                    const sourceResults = await freeVideoAdapter.searchAll(q, { count: 5, maxDuration: 30 });
                    const allVideos: MediaAsset[] = [];
                    for (const sr of sourceResults) {
                        for (const v of sr.results) {
                            const wh = v.resolution?.split('x').map(Number) || [0, 0];
                            allVideos.push({
                                type: 'video',
                                url: v.downloadUrl,
                                width: wh[0] || 0,
                                height: wh[1] || 0,
                                photographer: v.creator || undefined,
                                videoDuration: v.durationSeconds || TARGET_VIDEO_DURATION_SECONDS,
                            } as MediaAsset);
                        }
                    }
                    if (allVideos.length > 0) {
                        const pickIndex = Math.min(resultIndex, allVideos.length - 1);
                        const pick = allVideos[pickIndex];
                        if (pick && pick.url) {
                            console.log(`  ⚡ FALLBACK [Free Video] Selected candidate #${pickIndex + 1} for "${q}"`);
                            cache[cacheKey] = pick;
                            saveCache(cache);
                            return pick;
                        }
                    }
                } catch { /* next source */ }
            } else {
                // ── FREE IMAGE SOURCES (last resort fallback) ──────────────
                const freeImages = await searchFreeImages(q, 5);
                if (freeImages.length > 0) {
                    const pickIndex = Math.min(resultIndex, freeImages.length - 1);
                    const pick = freeImages[pickIndex];
                    if (pick && pick.url) {
                        console.log(`  ⚡ FALLBACK [Free Image] Selected candidate #${pickIndex + 1} for "${q}"`);
                        cache[cacheKey] = pick;
                        saveCache(cache);
                        return pick;
                    }
                }
            }
        } catch (e) {
            console.log(`⚠ [FETCH] Error querying "${q}": ${(e as Error).message}`);
            continue;
        }
    }

    // Last resort: try the opposite type (image → video or video → image)
    try {
        const oppositeKind = preferVideo ? 'image' : 'video';
        const result = await fetchVisualsForScene(keywords, oppositeKind !== 'image', orientation, undefined, resultIndex);
        if (result) {
            if (Array.isArray(result)) {
                if (result.length > 0) {
                    cache[cacheKey] = result[0];
                    saveCache(cache);
                    return result[0];
                }
            } else {
                cache[cacheKey] = result;
                saveCache(cache);
                return result;
            }
        }
    } catch { /* give up */ }

    console.log(`  ✗ No visual assets found for "${query}" from any source — generating offline placeholder card.`);
    try {
        return await generatePlaceholderAsset(query, cacheOrientation);
    } catch (e) {
        console.log(`  ✗ Placeholder generation also failed: ${(e as Error).message}`);
        return null;
    }
}

// ========================================================================
// Offline placeholder — guarantees a scene always has SOME visual
// ========================================================================
// When every network source fails (no Pexels key + free sources blip),
// synthesize a local gradient card with the keyword burnt on it. This keeps
// the slideshow at the correct scene count instead of silently dropping
// scenes (which previously produced 1/3-scene degenerate videos).

let _placeholderFont: string | undefined;
function placeholderFont(): string {
    if (_placeholderFont) return _placeholderFont;
    for (const f of ['C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']) {
        if (fs.existsSync(f)) { _placeholderFont = f; return f; }
    }
    return 'C:/Windows/Fonts/arial.ttf';
}

async function generatePlaceholderAsset(
    query: string,
    orientation: 'portrait' | 'landscape' | 'none',
): Promise<MediaAsset> {
    const dir = resolveProjectPath('workspace', 'cache', 'placeholders');
    fs.mkdirSync(dir, { recursive: true });
    const safe = (query || 'scene').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    const out = path.join(dir, `ph_${safe}.png`);
    if (fs.existsSync(out) && fs.statSync(out).size > 1000) {
        return { type: 'image', url: out, width: 1280, height: 720, photographer: 'placeholder' };
    }
    const [W, H] = orientation === 'portrait' ? [720, 1280] : [1280, 720];
    const label = query.length > 28 ? query.slice(0, 28) + '…' : query;
    execFileSync(ffmpegPath(), [
        '-y', '-v', 'error',
        '-f', 'lavfi', '-i', `color=c=0x1a2b4c:s=${W}x${H},format=yuv420p`,
        '-frames:v', '1',
        '-vf', `drawtext=fontfile='${placeholderFont()}':text='${label.replace(/'/g, "'\\\\''")}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2`,
        out,
    ], { timeout: 30000 });
    if (!fs.existsSync(out)) throw new Error('placeholder PNG not created');
    return { type: 'image', url: out, width: W, height: H, photographer: 'placeholder' };
}
