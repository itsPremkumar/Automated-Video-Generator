import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { execSync } from 'child_process';
import { logInfo, resolveProjectPath } from '../runtime';

// @ts-ignore - ffprobe-static types
import ffprobePath from 'ffprobe-static';

// Load environment variables from .env file
config({ path: resolveProjectPath('.env') });

const console = {
    log: (...args: unknown[]) => logInfo(...args),
};

export interface MediaAsset {
    type: 'image' | 'video';
    url: string;
    width: number;
    height: number;
    photographer?: string;
    localPath?: string;
    videoDuration?: number;  // Duration in seconds for video files
    videoTrimAfterFrames?: number;
}

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
const GEMINI_TIMEOUT_MS = Math.max(5000, Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '30000', 10) || 30000);
const GEMINI_MAX_RETRIES = Math.max(1, Number.parseInt(process.env.GEMINI_MAX_RETRIES || '3', 10) || 3);
const GEMINI_MAX_CONCURRENCY = Math.max(1, Number.parseInt(process.env.GEMINI_MAX_CONCURRENCY || '2', 10) || 2);

const BASE_URL = 'https://api.pexels.com/v1';
const CACHE_FILE = resolveProjectPath('.video-cache.json');
const MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024;
const DOWNLOAD_STALL_TIMEOUT_MS = 15000;
const TARGET_VIDEO_DURATION_SECONDS = 6;
const DEFAULT_RENDER_FPS = 30;
const SAFE_VIDEO_END_BUFFER_FRAMES = 15;

// Preferred video quality order (highest first)
const PREFERRED_QUALITIES = ['uhd', 'hd', 'sd'];
const MIN_WIDTH = 720; // Minimum acceptable video width

// Log API key status on load
// console.log('\n🔑 [VISUAL-FETCHER] Module loaded');
// console.log(`🔑 [VISUAL-FETCHER] Pexels API Key: ${PEXELS_API_KEY ? `${PEXELS_API_KEY.substring(0, 8)}...` : '❌ NOT SET'}`);
// console.log(`🔑 [VISUAL-FETCHER] Cache file: ${CACHE_FILE}`);

// Simple cache for video URLs
interface VideoCache {
    [keywords: string]: MediaAsset;
}

function loadCache(): VideoCache {
    // console.log('📦 [CACHE] Loading cache...');
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
            const entries = Object.keys(cache).length;
            // console.log(`📦 [CACHE] Loaded ${entries} cached entries`);
            return cache;
        }
        // console.log('📦 [CACHE] No cache file found, starting fresh');
    } catch (error: any) {
        // console.error(`📦 [CACHE] Error loading cache: ${error.message}`);
    }
    return {};
}

// In-memory singleton cache to prevent concurrency issues
let inMemoryCache: VideoCache | null = null;

function getCache(): VideoCache {
    if (inMemoryCache) return inMemoryCache;
    inMemoryCache = loadCache();
    return inMemoryCache;
}

/**
 * Explicitly reset the in-memory cache
 */
export function resetInMemoryCache(): void {
    inMemoryCache = {};
    if (fs.existsSync(CACHE_FILE)) {
        try {
            fs.unlinkSync(CACHE_FILE);
        } catch (e) { }
    }
}

export function invalidateCachedVisual(
    keywords: string[],
    orientation: 'portrait' | 'landscape' = 'portrait'
): void {
    const cacheKey = `${keywords.join(' ').toLowerCase()}:${orientation}`;
    const cache = getCache();

    if (cache[cacheKey]) {
        delete cache[cacheKey];
        saveCache(cache);
    }
}

function saveCache(cache: VideoCache): void {
    try {
        const entries = Object.keys(cache).length;
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
        // console.log(`📦 [CACHE] Saved ${entries} entries to cache`);
    } catch (error: any) {
        // console.error(`📦 [CACHE] Error saving cache: ${error.message}`);
    }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export interface VideoMetadata {
    durationSeconds: number;
    trimAfterFrames: number;
}

const parsePositiveNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? value : undefined;
    }

    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }

    return undefined;
};

const parsePositiveInteger = (value: unknown): number | undefined => {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
    }

    if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }

    return undefined;
};

const parseFrameRate = (value: unknown): number | undefined => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return undefined;
    }

    if (!value.includes('/')) {
        return parsePositiveNumber(value);
    }

    const [numerator, denominator] = value.split('/');
    const top = parseFloat(numerator);
    const bottom = parseFloat(denominator);

    if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom === 0) {
        return undefined;
    }

    const rate = top / bottom;
    return Number.isFinite(rate) && rate > 0 ? rate : undefined;
};

const estimateVideoDurationFromSize = (filePath: string): number | undefined => {
    try {
        const stats = fs.statSync(filePath);
        const sizeMB = stats.size / (1024 * 1024);
        return Math.max(3, Math.min(30, sizeMB * 0.5));
    } catch {
        return undefined;
    }
};

const calculateSafeTrimAfterFrames = (
    durationSeconds: number,
    renderFps: number = DEFAULT_RENDER_FPS
): number => {
    const durationFrames = Math.max(1, Math.floor(durationSeconds * renderFps));
    return Math.max(1, durationFrames - SAFE_VIDEO_END_BUFFER_FRAMES);
};

/**
 * Get conservative video metadata for Remotion rendering.
 * We trim a few frames from the end because some stock clips report a
 * slightly longer duration than the actually seekable final frame.
 */
export function getVideoMetadata(
    filePath: string,
    renderFps: number = DEFAULT_RENDER_FPS
): VideoMetadata {
    try {
        const ffprobeCmd = ffprobePath.path || 'ffprobe';
        const result = execSync(
            `"${ffprobeCmd}" -v quiet -count_frames -print_format json -show_entries format=duration:stream=codec_type,duration,avg_frame_rate,r_frame_rate,nb_frames,nb_read_frames "${filePath}"`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const parsed = JSON.parse(result) as {
            format?: { duration?: string };
            streams?: Array<{
                codec_type?: string;
                duration?: string;
                avg_frame_rate?: string;
                r_frame_rate?: string;
                nb_frames?: string;
                nb_read_frames?: string;
            }>;
        };

        const videoStream = parsed.streams?.find((stream) => stream.codec_type === 'video') ?? parsed.streams?.[0];
        const formatDuration = parsePositiveNumber(parsed.format?.duration);
        const streamDuration = parsePositiveNumber(videoStream?.duration);
        const rawDuration = streamDuration ?? formatDuration;
        const sourceFrameRate =
            parseFrameRate(videoStream?.avg_frame_rate) ??
            parseFrameRate(videoStream?.r_frame_rate);
        const sourceFrameCount =
            parsePositiveInteger(videoStream?.nb_read_frames) ??
            parsePositiveInteger(videoStream?.nb_frames);

        let measuredDuration = rawDuration;
        if (sourceFrameCount && sourceFrameRate) {
            const frameBasedDuration = sourceFrameCount / sourceFrameRate;
            measuredDuration = measuredDuration
                ? Math.min(measuredDuration, frameBasedDuration)
                : frameBasedDuration;
        }

        if (measuredDuration) {
            return {
                durationSeconds: measuredDuration,
                trimAfterFrames: calculateSafeTrimAfterFrames(measuredDuration, renderFps),
            };
        }
    } catch {
        // ffprobe not available or returned invalid metadata
    }

    const estimatedDuration = estimateVideoDurationFromSize(filePath);
    if (estimatedDuration) {
        return {
            durationSeconds: estimatedDuration,
            trimAfterFrames: calculateSafeTrimAfterFrames(estimatedDuration, renderFps),
        };
    }

    return {
        durationSeconds: 5,
        trimAfterFrames: calculateSafeTrimAfterFrames(5, renderFps),
    };
}

/**
 * Get video duration in seconds using ffprobe
 * Falls back to file size estimation if ffprobe unavailable
 */
export function getVideoDuration(filePath: string): number {
    return getVideoMetadata(filePath).durationSeconds;
}


/**
 * Select the best quality video file
 */
function selectBestVideoFile(videoFiles: any[]): any {
    // console.log(`    🎬 [QUALITY] Selecting best from ${videoFiles.length} video files`);

    // Log available qualities
    const qualities = videoFiles.map(f => `${f.quality} (${f.width}x${f.height})`);
    // console.log(`    🎬 [QUALITY] Available: ${qualities.join(', ')}`);

    // Filter out videos that are too small
    const validFiles = videoFiles.filter(f => f.width >= MIN_WIDTH);
    // console.log(`    🎬 [QUALITY] Files >= ${MIN_WIDTH}px width: ${validFiles.length}`);

    if (validFiles.length === 0) {
        // console.log(`    🎬 [QUALITY] No valid files, using first available`);
        return videoFiles[0];
    }

    // Find best quality
    for (const quality of PREFERRED_QUALITIES) {
        const match = validFiles.find((f: any) => f.quality === quality);
        if (match) {
            // console.log(`    🎬 [QUALITY] Selected: ${quality} (${match.width}x${match.height})`);
            return match;
        }
    }

    // Fallback to highest width
    const sorted = validFiles.sort((a, b) => b.width - a.width)[0];
    // console.log(`    🎬 [QUALITY] Fallback to largest: ${sorted.width}x${sorted.height}`);
    return sorted;
}

function sortVideoAssets(assets: MediaAsset[]): MediaAsset[] {
    return assets.sort((left: MediaAsset, right: MediaAsset) => {
        const leftDur = left.videoDuration || TARGET_VIDEO_DURATION_SECONDS;
        const rightDur = right.videoDuration || TARGET_VIDEO_DURATION_SECONDS;
        const leftDelta = Math.abs(leftDur - TARGET_VIDEO_DURATION_SECONDS);
        const rightDelta = Math.abs(rightDur - TARGET_VIDEO_DURATION_SECONDS);

        if (leftDelta !== rightDelta) {
            return leftDelta - rightDelta;
        }

        const leftPixels = left.width * left.height;
        const rightPixels = right.width * right.height;
        return rightPixels - leftPixels;
    });
}

let activeGeminiRequests = 0;
const geminiWaitQueue: Array<() => void> = [];

async function withGeminiSlot<T>(task: () => Promise<T>): Promise<T> {
    if (activeGeminiRequests >= GEMINI_MAX_CONCURRENCY) {
        await new Promise<void>((resolve) => geminiWaitQueue.push(resolve));
    }

    activeGeminiRequests += 1;
    try {
        return await task();
    } finally {
        activeGeminiRequests = Math.max(0, activeGeminiRequests - 1);
        geminiWaitQueue.shift()?.();
    }
}

function normalizeKeywordList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const uniqueKeywords = new Set<string>();

    for (const item of value) {
        if (typeof item !== 'string') {
            continue;
        }

        const normalized = item.trim().replace(/\s+/g, ' ');
        if (normalized) {
            uniqueKeywords.add(normalized);
        }
    }

    return Array.from(uniqueKeywords).slice(0, 3);
}

function parseGeminiKeywordResponse(responseText: string): string[] {
    const cleaned = responseText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    if (!cleaned) {
        return [];
    }

    try {
        return normalizeKeywordList(JSON.parse(cleaned));
    } catch {
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        if (!arrayMatch) {
            return [];
        }

        try {
            return normalizeKeywordList(JSON.parse(arrayMatch[0]));
        } catch {
            return [];
        }
    }
}

function shouldRetryGeminiRequest(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
        return false;
    }

    if (error.code === 'ECONNABORTED') {
        return true;
    }

    const status = error.response?.status;
    if (!status) {
        return true;
    }

    return status === 429 || status >= 500;
}

function formatGeminiError(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status) {
            return `${error.message} (HTTP ${status})`;
        }

        if (error.code) {
            return `${error.message} (${error.code})`;
        }

        return error.message;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

async function optimizeKeywordsWithGeminiInternal(
    sceneText: string,
    defaultKeywords: string[]
): Promise<string[]> {
    const prompt = `You are an expert AI video director.
I have this voiceover text for a video scene: "${sceneText}"

Return a JSON array of up to 3 highly optimized, cinematic search queries (strings) to find the best matching B-roll footage on Pexels or Pixabay.
The queries should be concise but descriptive (e.g. "cinematic dark moody rain window", "aerial drone city sunset").
Only return the JSON array, no other text or formatting. DO NOT wrap with \`\`\`json.`;

    for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt++) {
        try {
            const response = await withGeminiSlot(() =>
                axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
                    {
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.7,
                            responseMimeType: 'application/json',
                        },
                    },
                    {
                        timeout: GEMINI_TIMEOUT_MS,
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    }
                )
            );

            const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const optimizedKeywords = parseGeminiKeywordResponse(responseText);

            if (optimizedKeywords.length > 0) {
                console.log(`\n[AI-DIRECTOR] Optimized keywords for scene: "${sceneText.substring(0, 50)}..."`);
                console.log(`[AI-DIRECTOR] Generated queries:`, optimizedKeywords);
                return optimizedKeywords;
            }

            console.log('[AI-DIRECTOR] Gemini returned no usable keyword array, using default query');
            return defaultKeywords;
        } catch (error) {
            const shouldRetry = attempt < GEMINI_MAX_RETRIES && shouldRetryGeminiRequest(error);
            if (shouldRetry) {
                const retryDelay = attempt * 1500;
                console.log(`[AI-DIRECTOR] Retry ${attempt}/${GEMINI_MAX_RETRIES - 1} after ${retryDelay}ms: ${formatGeminiError(error)}`);
                await sleep(retryDelay);
                continue;
            }

            console.log(`[AI-DIRECTOR] Error optimizing keywords: ${formatGeminiError(error)}`);
        }
    }

    return defaultKeywords;
}

/**
 * Search for video footage on Pexels with retry logic
 */
export async function searchVideos(
    query: string,
    perPage: number = 15,
    retries: number = 3,
    orientation: 'portrait' | 'landscape' | 'none' = 'portrait'
): Promise<MediaAsset[]> {
    // console.log(`\n🔍 [PEXELS-VIDEO] Searching videos for: "${query}"`);
    // console.log(`🔍 [PEXELS-VIDEO] Per page: ${perPage}, Max retries: ${retries}`);

    if (!PEXELS_API_KEY) {
        // console.warn('🔍 [PEXELS-VIDEO] ❌ No API key - returning empty result');
        return [];
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        // console.log(`🔍 [PEXELS-VIDEO] Attempt ${attempt}/${retries}...`);
        const startTime = Date.now();

        try {
            const response = await axios.get(`https://api.pexels.com/videos/search`, {
                headers: {
                    Authorization: PEXELS_API_KEY,
                },
                params: {
                    query,
                    per_page: perPage,
                    ...(orientation !== 'none' ? { orientation } : {}),
                },
                timeout: 10000,
            });

            const elapsed = Date.now() - startTime;
            // console.log(`🔍 [PEXELS-VIDEO] Response received in ${elapsed}ms`);
            // console.log(`🔍 [PEXELS-VIDEO] Status: ${response.status}`);
            // console.log(`🔍 [PEXELS-VIDEO] Videos found: ${response.data.videos?.length || 0}`);

            if (!response.data.videos || response.data.videos.length === 0) {
                // console.log(`🔍 [PEXELS-VIDEO] No videos in response`);
                return [];
            }

            const assets = response.data.videos.map((video: any, idx: number) => {
                // console.log(`  🎥 [VIDEO ${idx + 1}] ID: ${video.id}, By: ${video.user.name}`);
                // console.log(`  🎥 [VIDEO ${idx + 1}] Files: ${video.video_files.length}`);

                const bestFile = selectBestVideoFile(video.video_files);

                return {
                    type: 'video' as const,
                    url: bestFile.link,
                    width: bestFile.width,
                    height: bestFile.height,
                    photographer: video.user.name,
                    videoDuration: video.duration,
                };
            });

            return sortVideoAssets(assets);
        } catch (error: any) {
            const elapsed = Date.now() - startTime;
            // console.error(`🔍 [PEXELS-VIDEO] ❌ Error after ${elapsed}ms: ${error.message}`);

            if (error.response) {
                // console.error(`🔍 [PEXELS-VIDEO] Status: ${error.response.status}`);
                // console.error(`🔍 [PEXELS-VIDEO] Data: ${JSON.stringify(error.response.data)}`);
            }

            if (attempt < retries) {
                const delay = 1000 * attempt;
                // console.warn(`🔍 [PEXELS-VIDEO] Retrying in ${delay}ms...`);
                await sleep(delay);
            } else {
                // console.error('🔍 [PEXELS-VIDEO] All retries exhausted');
                return [];
            }
        }
    }
    return [];
}

/**
 * Search for images on Pexels with retry logic
 */
export async function searchImages(
    query: string,
    perPage: number = 1,
    retries: number = 3,
    orientation: 'portrait' | 'landscape' = 'portrait'
): Promise<MediaAsset[]> {
    // console.log(`\n🔍 [PEXELS-IMAGE] Searching images for: "${query}"`);
    // console.log(`🔍 [PEXELS-IMAGE] Per page: ${perPage}, Max retries: ${retries}`);

    if (!PEXELS_API_KEY) {
        // console.warn('🔍 [PEXELS-IMAGE] ❌ No API key - returning empty result');
        return [];
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        // console.log(`🔍 [PEXELS-IMAGE] Attempt ${attempt}/${retries}...`);
        const startTime = Date.now();

        try {
            const response = await axios.get(`${BASE_URL}/search`, {
                headers: {
                    Authorization: PEXELS_API_KEY,
                },
                params: {
                    query,
                    per_page: perPage,
                    orientation,
                },
                timeout: 10000,
            });

            const elapsed = Date.now() - startTime;
            // console.log(`🔍 [PEXELS-IMAGE] Response received in ${elapsed}ms`);
            // console.log(`🔍 [PEXELS-IMAGE] Status: ${response.status}`);
            // console.log(`🔍 [PEXELS-IMAGE] Photos found: ${response.data.photos?.length || 0}`);

            if (!response.data.photos || response.data.photos.length === 0) {
                // console.log(`🔍 [PEXELS-IMAGE] No photos in response`);
                return [];
            }

            return response.data.photos.map((photo: any, idx: number) => {
                // console.log(`  🖼️ [PHOTO ${idx + 1}] ID: ${photo.id}, By: ${photo.photographer}`);
                // console.log(`  🖼️ [PHOTO ${idx + 1}] Size: ${photo.width}x${photo.height}`);

                return {
                    type: 'image' as const,
                    url: photo.src.large2x,
                    width: photo.width,
                    height: photo.height,
                    photographer: photo.photographer,
                };
            });
        } catch (error: any) {
            const elapsed = Date.now() - startTime;
            // console.error(`🔍 [PEXELS-IMAGE] ❌ Error after ${elapsed}ms: ${error.message}`);

            if (error.response) {
                // console.error(`🔍 [PEXELS-IMAGE] Status: ${error.response.status}`);
                // console.error(`🔍 [PEXELS-IMAGE] Data: ${JSON.stringify(error.response.data)}`);
            }

            if (attempt < retries) {
                const delay = 1000 * attempt;
                // console.warn(`🔍 [PEXELS-IMAGE] Retrying in ${delay}ms...`);
                await sleep(delay);
            } else {
                // console.error('🔍 [PEXELS-IMAGE] All retries exhausted');
                return [];
            }
        }
    }
    return [];
}

/**
 * Search for videos on Pixabay
 */
export async function searchPixabayVideos(
    query: string,
    perPage: number = 15,
    retries: number = 3,
    orientation: 'portrait' | 'landscape' | 'none' = 'portrait'
): Promise<MediaAsset[]> {
    // console.log(`\n🔍 [PIXABAY-VIDEO] Searching videos for: "${query}"`);

    if (!PIXABAY_API_KEY) {
        // console.warn('🔍 [PIXABAY-VIDEO] ❌ No API key - skipping');
        return [];
    }

    const pixabayOrientation = orientation === 'landscape' ? 'horizontal' : (orientation === 'portrait' ? 'vertical' : '');

    for (let attempt = 1; attempt <= retries; attempt++) {
        // console.log(`🔍 [PIXABAY-VIDEO] Attempt ${attempt}/${retries}...`);
        const startTime = Date.now();

        try {
            const response = await axios.get(`https://pixabay.com/api/videos/`, {
                params: {
                    key: PIXABAY_API_KEY,
                    q: query,
                    video_type: 'film',
                    ...(pixabayOrientation ? { orientation: pixabayOrientation } : {}),
                    per_page: perPage,
                    min_width: 1280 // Prefer HD+
                },
                timeout: 10000,
            });

            const elapsed = Date.now() - startTime;
            // console.log(`🔍 [PIXABAY-VIDEO] Response received in ${elapsed}ms`);

            if (!response.data.hits || response.data.hits.length === 0) {
                // console.log(`🔍 [PIXABAY-VIDEO] No videos found`);
                return [];
            }

            const assets = response.data.hits.map((hit: any) => {
                // Pixabay returns 'videos' object with sizes
                const sizes = hit.videos;
                // Prefer Large > Medium > Small
                const bestFile = sizes.large.url ? sizes.large : (sizes.medium.url ? sizes.medium : sizes.small);

                return {
                    type: 'video' as const,
                    url: bestFile.url,
                    width: bestFile.width,
                    height: bestFile.height,
                    photographer: hit.user,
                    videoDuration: hit.duration
                };
            });
            return sortVideoAssets(assets);
        } catch (error: any) {
            // console.error(`🔍 [PIXABAY-VIDEO] ❌ Error: ${error.message}`);
            if (attempt < retries) {
                await sleep(1000 * attempt);
            } else {
                return [];
            }
        }
    }
    return [];
}

/**
 * Use Gemini AI to optimize search keywords based on scene text.
 * Falls back to default keywords if API key is missing or on error.
 */
export async function optimizeKeywordsWithGemini(
    sceneText: string,
    defaultKeywords: string[]
): Promise<string[]> {
    if (!GEMINI_API_KEY) {
        return defaultKeywords;
    }

    return optimizeKeywordsWithGeminiInternal(sceneText, defaultKeywords);

    try {
        const prompt = `You are an expert AI video director.
I have this voiceover text for a video scene: "${sceneText}"

Return a JSON array of up to 3 highly optimized, cinematic search queries (strings) to find the best matching B-roll footage on Pexels or Pixabay.
The queries should be concise but descriptive (e.g. "cinematic dark moody rain window", "aerial drone city sunset").
Only return the JSON array, no other text or formatting. DO NOT wrap with \`\`\`json.`;

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7 }
            },
            { timeout: 10000 }
        );

        let responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!responseText) return defaultKeywords;

        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        const optimizedKeywords = JSON.parse(responseText);
        if (Array.isArray(optimizedKeywords) && optimizedKeywords.length > 0) {
            console.log(`\n🧠 [AI-DIRECTOR] Optimized keywords for scene: "${sceneText.substring(0, 50)}..."`);
            console.log(`🧠 [AI-DIRECTOR] Generated queries:`, optimizedKeywords);
            return optimizedKeywords;
        }
    } catch (error: any) {
        console.log(`🧠 [AI-DIRECTOR] ❌ Error optimizing keywords: ${error.message}`);
    }
    return defaultKeywords;
}

/**
 * Fetch visuals for a scene based on keywords (with caching)
 */
export async function fetchVisualsForScene(
    keywords: string[],
    preferVideo: boolean = true,
    orientation: 'portrait' | 'landscape' | 'none' = 'portrait',
    sceneText?: string
): Promise<MediaAsset | null> {
    const query = keywords.join(' ');
    const cacheKey = `${query.toLowerCase()}:${orientation}`;
    const cache = getCache();

    // Skip Gemini and provider calls entirely when we already have a cached result.
    if (cache[cacheKey]) {
        // console.log(`ðŸŽ¨ [FETCH] âœ… CACHE HIT! Using cached ${cache[cacheKey].type}`);
        // console.log(`ðŸŽ¨ [FETCH] URL: ${cache[cacheKey].url}`);
        return cache[cacheKey];
    }

    if (sceneText && preferVideo) {
        console.log('\n🧠 ════════════════════════════════════════════════');
        console.log(`🧠 [FETCH] Original query: "${query}"`);
    }

    const queriesToTry = sceneText && preferVideo
        ? await optimizeKeywordsWithGemini(sceneText, [query]) 
        : [query];

    // console.log('\n🎨 ════════════════════════════════════════════════');
    // console.log(`🎨 [FETCH] Fetching visuals for keywords: [${keywords.join(', ')}]`);
    // console.log(`🎨 [FETCH] Query: "${query}"`);
    // console.log(`🎨 [FETCH] Prefer video: ${preferVideo}`);

    // Check cache first
    if (cache[cacheKey]) {
        // console.log(`🎨 [FETCH] ✅ CACHE HIT! Using cached ${cache[cacheKey].type}`);
        // console.log(`🎨 [FETCH] URL: ${cache[cacheKey].url}`);
        return cache[cacheKey];
    }
    console.log(`🎨 [FETCH] Cache miss for "${query}", fetching from API...`);

    try {
        if (preferVideo) {
            for (const q of queriesToTry) {
                console.log(`🎨 [FETCH] 🎬 Trying query: "${q}"...`);
                const orientationsToTry: ('portrait' | 'landscape' | 'none')[] = 
                    orientation !== 'none' ? [orientation, 'none'] : ['none'];

                for (const orient of orientationsToTry) {
                    console.log(`🎨 [FETCH] 📐 Search Orientation: ${orient}`);
                    const videos = await searchVideos(q, 15, 2, orient);
                    if (videos.length > 0) {
                        console.log(`🎨 [FETCH] ✅ Found video on Pexels: ${videos[0].url} (${videos[0].width}x${videos[0].height}, ${videos[0].videoDuration}s)`);
                        cache[cacheKey] = videos[0];
                        saveCache(cache);
                        return videos[0];
                    }

                    const pixabayVideos = await searchPixabayVideos(q, 15, 2, orient);
                    if (pixabayVideos.length > 0) {
                        console.log(`🎨 [FETCH] ✅ Found video on Pixabay: ${pixabayVideos[0].url} (${pixabayVideos[0].width}x${pixabayVideos[0].height}, ${pixabayVideos[0].videoDuration}s)`);
                        cache[cacheKey] = pixabayVideos[0];
                        saveCache(cache);
                        return pixabayVideos[0];
                    }
                    console.log(`🎨 [FETCH] ⚠️ No video for "${q}" at orientation "${orient}"`);
                }
            }
        }

        // Fallback to images
        const images = await searchImages(query, 1, 3, orientation === 'none' ? 'portrait' : orientation);
        if (images.length > 0) {
            // console.log(`🎨 [FETCH] ✅ Found image: ${images[0].url}`);
            cache[cacheKey] = images[0];
            saveCache(cache);
            return images[0];
        }

        // console.log('🎨 [FETCH] ⚠️ No visuals found for this query');
        return null;
    } catch (error: any) {
        // console.error(`🎨 [FETCH] ❌ Error: ${error.message}`);
        // console.error(`🎨 [FETCH] Stack: ${error.stack}`);
        return null;
    }
}

/**
 * Download result with path and optional video duration
 */
export interface DownloadResult {
    path: string;
    videoDuration?: number;  // Duration in seconds for video files
    videoTrimAfterFrames?: number;
}

/**
 * Download a media file to local storage with retry logic
 * Returns path and video duration (if video)
 */
export async function downloadMedia(
    url: string,
    outputDir: string,
    filename: string,
    retries: number = 3
): Promise<DownloadResult> {
    const outputPath = path.join(outputDir, filename);

    // console.log(`\n⬇️ [DOWNLOAD] Starting download...`);
    // console.log(`⬇️ [DOWNLOAD] URL: ${url}`);
    // console.log(`⬇️ [DOWNLOAD] Output: ${outputPath}`);
    // console.log(`⬇️ [DOWNLOAD] Max retries: ${retries}`);

    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        // console.log(`⬇️ [DOWNLOAD] Creating directory: ${outputDir}`);
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // RESUME CHECK: If file exists and is valid, skip download
    if (fs.existsSync(outputPath)) {
        try {
            const stats = fs.statSync(outputPath);
            if (stats.size > 100 * 1024) { // Ignore > 100KB files
                // Get video duration if it's a video file
                let videoDuration: number | undefined;
                let videoTrimAfterFrames: number | undefined;
                if (filename.endsWith('.mp4') || filename.endsWith('.webm') || filename.endsWith('.mov')) {
                    const videoMetadata = getVideoMetadata(outputPath);
                    videoDuration = videoMetadata.durationSeconds;
                    videoTrimAfterFrames = videoMetadata.trimAfterFrames;
                }
                // console.log(`⬇️ [DOWNLOAD] File exists, skipping download: ${filename}`);
                return { path: outputPath, videoDuration, videoTrimAfterFrames };
            }
        } catch (e) {
            // Check failed, proceed to download
        }
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        // console.log(`⬇️ [DOWNLOAD] Attempt ${attempt}/${retries}...`);
        const startTime = Date.now();

        try {
            const response = await axios.get(url, {
                responseType: 'stream',
                timeout: 60000,
            });

            // console.log(`⬇️ [DOWNLOAD] Response status: ${response.status}`);
            // console.log(`⬇️ [DOWNLOAD] Content-Type: ${response.headers['content-type']}`);
            // console.log(`⬇️ [DOWNLOAD] Content-Length: ${response.headers['content-length']} bytes`);

            const tmpPath = `${outputPath}.tmp`;
            if (fs.existsSync(tmpPath)) try { fs.unlinkSync(tmpPath); } catch (e) {}
            const writer = fs.createWriteStream(tmpPath);
            let settled = false;
            let stallTimer: NodeJS.Timeout | null = null;

            const clearStallTimer = () => {
                if (stallTimer) {
                    clearTimeout(stallTimer);
                    stallTimer = null;
                }
            };

            const refreshStallTimer = () => {
                clearStallTimer();
                stallTimer = setTimeout(() => {
                    response.data.destroy(new Error(`Download stalled for ${filename}`));
                }, DOWNLOAD_STALL_TIMEOUT_MS);
            };

            const contentLength = Number(response.headers['content-length'] || '0');
            if (contentLength > MAX_DOWNLOAD_BYTES) {
                writer.destroy();
                response.data.destroy();
                throw new Error(`File too large to download (${contentLength} bytes): ${filename}`);
            }

            return await new Promise((resolve, reject) => {
                refreshStallTimer();
                response.data.on('data', () => refreshStallTimer());
                response.data.on('error', (err: Error) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearStallTimer();
                    writer.destroy();
                    try { fs.unlinkSync(tmpPath); } catch (e) {}
                    reject(err);
                });
                response.data.pipe(writer);

                const finalize = () => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearStallTimer();
                    const elapsed = Date.now() - startTime;
                    
                    if (fs.existsSync(tmpPath)) {
                        try { fs.renameSync(tmpPath, outputPath); } 
                        catch (e: any) { reject(new Error(`Failed to save: ${e.message}`)); return; }
                    }

                    if (!fs.existsSync(outputPath)) {
                        reject(new Error(`Downloaded file missing after write: ${outputPath}`));
                        return;
                    }

                    const stats = fs.statSync(outputPath);
                    // console.log(`⬇️ [DOWNLOAD] ✅ Complete in ${elapsed}ms`);
                    // console.log(`⬇️ [DOWNLOAD] File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

                    // Get video duration if it's a video file
                    let videoDuration: number | undefined;
                    let videoTrimAfterFrames: number | undefined;
                    if (filename.endsWith('.mp4') || filename.endsWith('.webm') || filename.endsWith('.mov')) {
                        const videoMetadata = getVideoMetadata(outputPath);
                        videoDuration = videoMetadata.durationSeconds;
                        videoTrimAfterFrames = videoMetadata.trimAfterFrames;
                    }

                    resolve({ path: outputPath, videoDuration, videoTrimAfterFrames });
                };

                writer.on('finish', () => undefined);
                writer.on('close', finalize);
                writer.on('error', (err) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    clearStallTimer();
                    try { fs.unlinkSync(tmpPath); } catch (e) {}
                    // console.error(`⬇️ [DOWNLOAD] ❌ Write error: ${err.message}`);
                    reject(err);
                });
            });
        } catch (error: any) {
            const elapsed = Date.now() - startTime;
            // console.error(`⬇️ [DOWNLOAD] ❌ Error after ${elapsed}ms: ${error.message}`);

            if (error.response) {
                // console.error(`⬇️ [DOWNLOAD] Status: ${error.response.status}`);
            }

            if (attempt < retries) {
                const delay = 1000 * attempt;
                // console.warn(`⬇️ [DOWNLOAD] Retrying in ${delay}ms...`);
                await sleep(delay);
            } else {
                // console.error('⬇️ [DOWNLOAD] All retries exhausted, throwing error');
                throw error;
            }
        }
    }
    throw new Error('Download failed after all retries');
}



