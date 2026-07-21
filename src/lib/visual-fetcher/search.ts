import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { logInfo, resolveProjectPath } from '../../runtime';
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
const OPENVERSE_ENABLED = process.env.OPENVERSE_ENABLED !== 'false';
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
// Pexels search — videos
// ========================================================================

export async function searchVideos(
    query: string,
    count: number = 15,
    page: number = 1,
    orientation: 'portrait' | 'landscape' | 'square' | '' = '',
): Promise<MediaAsset[]> {
    const apiKey = getPexelsApiKey();
    if (!apiKey) {
        console.log('⚠ [PEXELS] No API key set, skipping Pexels video search');
        return [];
    }

    try {
        const params: Record<string, string | number> = {
            query,
            per_page: Math.min(count, 80),
            page,
        };
        if (orientation) params.orientation = orientation;

        const response = await axios.get(`${BASE_URL}/videos/search`, {
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
            console.log('⚠ [PEXELS] Rate limited (429), waiting 5s…');
            await sleep(5000);
            return searchVideos(query, count, page, orientation);
        }
        console.log(`⚠ [PEXELS] Search error: ${error?.message || error}`);
        return [];
    }
}

// ========================================================================
// Pexels search — images
// ========================================================================

export async function searchImages(
    query: string,
    count: number = 15,
    page: number = 1,
    orientation: 'portrait' | 'landscape' | 'square' | '' = '',
    minWidth?: number,
): Promise<MediaAsset[]> {
    const apiKey = getPexelsApiKey();
    if (!apiKey) return [];

    try {
        const params: Record<string, string | number> = {
            query,
            per_page: Math.min(count, 80),
            page,
        };
        if (orientation) params.orientation = orientation;

        const response = await axios.get(`${BASE_URL}/search`, {
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
// Free image search (Openverse, Wikimedia, etc.)
// ========================================================================

export async function searchFreeImages(
    query: string,
    count: number = 8,
): Promise<MediaAsset[]> {
    const results: MediaAsset[] = [];

    // Openverse via our fetcher
    if (OPENVERSE_ENABLED) {
        try {
            const openverse = await searchOpenverseImages(query, count);
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
            console.log(`⚠ [OPENVERSE] Search error: ${(e as Error).message}`);
        }
    }

    // FreeImageAdapter (Wikimedia, Archive, etc.)
    try {
        const sourceResults = await freeImageAdapter.searchAll(query, { count: Math.max(1, count - results.length) });
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
        console.log(`⚠ [FREE-IMAGE] Search error: ${(e as Error).message}`);
    }

    return results;
}

// ========================================================================
// Pixabay video search
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
// fetchVisualsForScene — the main orchestrator with resultIndex support
// ========================================================================

export async function fetchVisualsForScene(
    keywords: string[],
    preferVideo: boolean,
    orientation: 'portrait' | 'landscape' | 'none' = 'portrait',
    _outputDir?: string,
    resultIndex: number = 0,
): Promise<MediaAsset | MediaAsset[] | null> {
    if (!keywords || keywords.length === 0) return null;

    const query = keywords.join(' ');
    const cacheKey = `${buildCacheKey(query, orientation, preferVideo ? 'video' : 'image')}_r${resultIndex}`;
    const legacyCacheKey = buildLegacyCacheKey(query, orientation);

    const cache = getCache();

    // Legacy migration: if only the old non-resultIndex cache key exists, copy it
    const legacyCachedAsset = cache[legacyCacheKey];
    if (legacyCachedAsset?.type === (preferVideo ? 'video' : 'image')) {
        cache[cacheKey] = legacyCachedAsset;
        saveCache(cache);
    }

    if (cache[cacheKey]) {
        // console.log(`🎨 [CACHE] HIT for "${query}" (r=${resultIndex})`);
        return cache[cacheKey];
    }

    // Deduplicate individual queries so the same keyword isn't sent twice
    const individualQueries = [...new Set(
        keywords.map((k) => k.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()).filter(Boolean),
    )];

    const queriesToTry = individualQueries.length > 0 ? individualQueries : [query];

    for (const q of queriesToTry) {
        try {
            if (preferVideo) {
                // Try Pexels videos first
                let videos = await searchVideos(q, 15, 1, orientation === 'none' ? '' : orientation);
                if (videos.length > 0) {
                    const pickIndex = Math.min(resultIndex, videos.length - 1);
                    const pick = videos[pickIndex];
                    if (pick && pick.url) {
                        cache[cacheKey] = pick;
                        saveCache(cache);
                        return pick;
                    }
                }

                // Try Pixabay videos
                videos = await searchPixabayVideos(q, 15, orientation === 'none' ? 'all' : orientation);
                if (videos.length > 0) {
                    const pickIndex = Math.min(resultIndex, videos.length - 1);
                    const pick = videos[pickIndex];
                    if (pick && pick.url) {
                        cache[cacheKey] = pick;
                        saveCache(cache);
                        return pick;
                    }
                }

                // Try free video sources
                try {
                    const sourceResults = await freeVideoAdapter.searchAll(q, {
                        count: 5,
                        maxDuration: 30,
                    });
                    const allVideos: import('./types').MediaAsset[] = [];
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
                            } as import('./types').MediaAsset);
                        }
                    }
                    if (allVideos.length > 0) {
                        const pickIndex = Math.min(resultIndex, allVideos.length - 1);
                        const pick = allVideos[pickIndex];
                        if (pick && pick.url) {
                            cache[cacheKey] = pick;
                            saveCache(cache);
                            return pick;
                        }
                    }
                } catch { /* next source */ }
            } else {
                // Try Pexels images
                let images = await searchImages(q, 15, 1, orientation === 'none' ? '' : orientation);
                if (images.length > 0) {
                    const pickIndex = Math.min(resultIndex, images.length - 1);
                    const pick = images[pickIndex];
                    if (pick && pick.url) {
                        cache[cacheKey] = pick;
                        saveCache(cache);
                        return pick;
                    }
                }

                // Try free images
                const freeImages = await searchFreeImages(q, 5);
                if (freeImages.length > 0) {
                    const pickIndex = Math.min(resultIndex, freeImages.length - 1);
                    const pick = freeImages[pickIndex];
                    if (pick && pick.url) {
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

    // Absolute last resort: any free source regardless of type
    try {
        const sourceResults = await freeVideoAdapter.searchAll(query, { count: 5, maxDuration: 30 });
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
                });
            }
        }
        if (allVideos.length > 0) {
            const pickIndex = Math.min(resultIndex, allVideos.length - 1);
            const pick = allVideos[pickIndex];
            if (pick && pick.url) {
                cache[cacheKey] = pick;
                saveCache(cache);
                return pick;
            }
        }
    } catch { /* give up */ }

    return null;
}
