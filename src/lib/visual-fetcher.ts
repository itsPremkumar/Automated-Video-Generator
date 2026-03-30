import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { execSync } from 'child_process';

// @ts-ignore - ffprobe-static types
import ffprobePath from 'ffprobe-static';

// Load environment variables from .env file
config();

export interface MediaAsset {
    type: 'image' | 'video';
    url: string;
    width: number;
    height: number;
    photographer?: string;
    localPath?: string;
    videoDuration?: number;  // Duration in seconds for video files
}

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY || '';

const BASE_URL = 'https://api.pexels.com/v1';
const CACHE_FILE = path.join(process.cwd(), '.video-cache.json');

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

/**
 * Get video duration in seconds using ffprobe
 * Falls back to file size estimation if ffprobe unavailable
 */
export function getVideoDuration(filePath: string): number {
    // Try ffprobe-static first (bundled binary)
    try {
        const ffprobeCmd = ffprobePath.path || 'ffprobe';
        const result = execSync(
            `"${ffprobeCmd}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const duration = parseFloat(result.trim());
        if (!isNaN(duration) && duration > 0) {
            // console.log(`⏱️ [VIDEO-DURATION] ${path.basename(filePath)}: ${duration.toFixed(2)}s (ffprobe)`);
            return duration;
        }
    } catch {
        // ffprobe not available
    }

    // Fallback: estimate from file size
    // Rough estimate: 1MB ≈ 1 second for HD video
    try {
        const stats = fs.statSync(filePath);
        const sizeMB = stats.size / (1024 * 1024);
        const estimatedDuration = Math.max(3, Math.min(30, sizeMB * 0.5)); // 0.5s per MB, clamp 3-30s
        // console.log(`⏱️ [VIDEO-DURATION] ${path.basename(filePath)}: ~${estimatedDuration.toFixed(1)}s (estimated from ${sizeMB.toFixed(1)}MB)`);
        return estimatedDuration;
    } catch {
        // Can't read file
    }

    // Last resort fallback: 5 seconds (conservative)
    // console.log(`⏱️ [VIDEO-DURATION] Using fallback: 5s`);
    return 5;
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

/**
 * Search for video footage on Pexels with retry logic
 */
export async function searchVideos(
    query: string,
    perPage: number = 1,
    retries: number = 3,
    orientation: 'portrait' | 'landscape' = 'portrait'
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
                    orientation,
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

            return response.data.videos.map((video: any, idx: number) => {
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
    perPage: number = 3,
    retries: number = 3,
    orientation: 'portrait' | 'landscape' = 'portrait'
): Promise<MediaAsset[]> {
    // console.log(`\n🔍 [PIXABAY-VIDEO] Searching videos for: "${query}"`);

    if (!PIXABAY_API_KEY) {
        // console.warn('🔍 [PIXABAY-VIDEO] ❌ No API key - skipping');
        return [];
    }

    const pixabayOrientation = orientation === 'landscape' ? 'horizontal' : 'vertical';

    for (let attempt = 1; attempt <= retries; attempt++) {
        // console.log(`🔍 [PIXABAY-VIDEO] Attempt ${attempt}/${retries}...`);
        const startTime = Date.now();

        try {
            const response = await axios.get(`https://pixabay.com/api/videos/`, {
                params: {
                    key: PIXABAY_API_KEY,
                    q: query,
                    video_type: 'film',
                    orientation: pixabayOrientation,
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

            return response.data.hits.map((hit: any) => {
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
 * Fetch visuals for a scene based on keywords (with caching)
 */
export async function fetchVisualsForScene(
    keywords: string[],
    preferVideo: boolean = true,
    orientation: 'portrait' | 'landscape' = 'portrait'
): Promise<MediaAsset | null> {
    const query = keywords.join(' ');
    const cacheKey = `${query.toLowerCase()}:${orientation}`;

    // console.log('\n🎨 ════════════════════════════════════════════════');
    // console.log(`🎨 [FETCH] Fetching visuals for keywords: [${keywords.join(', ')}]`);
    // console.log(`🎨 [FETCH] Query: "${query}"`);
    // console.log(`🎨 [FETCH] Prefer video: ${preferVideo}`);

    // Check cache first
    const cache = getCache();
    if (cache[cacheKey]) {
        // console.log(`🎨 [FETCH] ✅ CACHE HIT! Using cached ${cache[cacheKey].type}`);
        // console.log(`🎨 [FETCH] URL: ${cache[cacheKey].url}`);
        return cache[cacheKey];
    }
    console.log(`🎨 [FETCH] Cache miss for "${query}", fetching from API...`);

    try {
        if (preferVideo) {
            // console.log(`🎨 [FETCH] Trying video search first...`);
            const videos = await searchVideos(query, 1, 3, orientation);
            if (videos.length > 0) {
                // console.log(`🎨 [FETCH] ✅ Found video: ${videos[0].url}`);
                // console.log(`🎨 [FETCH] Resolution: ${videos[0].width}x${videos[0].height}`);
                cache[cacheKey] = videos[0];
                saveCache(cache);
                return videos[0];
            }
            // console.log(`🎨 [FETCH] No videos found on Pexels, trying Pixabay...`);

            // Fallback to Pixabay
            const pixabayVideos = await searchPixabayVideos(query, 3, 3, orientation);
            if (pixabayVideos.length > 0) {
                // console.log(`🎨 [FETCH] ✅ Found Pixabay video: ${pixabayVideos[0].url}`);
                cache[cacheKey] = pixabayVideos[0];
                saveCache(cache);
                return pixabayVideos[0];
            }

            // console.log(`🎨 [FETCH] No videos found on Pixabay either, trying images...`);
        }

        // Fallback to images
        const images = await searchImages(query, 1, 3, orientation);
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
            if (stats.size > 1024) { // Ignore > 1KB files
                // Get video duration if it's a video file
                let videoDuration: number | undefined;
                if (filename.endsWith('.mp4') || filename.endsWith('.webm') || filename.endsWith('.mov')) {
                    videoDuration = getVideoDuration(outputPath);
                }
                // console.log(`⬇️ [DOWNLOAD] File exists, skipping download: ${filename}`);
                return { path: outputPath, videoDuration };
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

            const writer = fs.createWriteStream(outputPath);

            response.data.pipe(writer);

            return await new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    const elapsed = Date.now() - startTime;
                    const stats = fs.statSync(outputPath);
                    // console.log(`⬇️ [DOWNLOAD] ✅ Complete in ${elapsed}ms`);
                    // console.log(`⬇️ [DOWNLOAD] File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

                    // Get video duration if it's a video file
                    let videoDuration: number | undefined;
                    if (filename.endsWith('.mp4') || filename.endsWith('.webm') || filename.endsWith('.mov')) {
                        videoDuration = getVideoDuration(outputPath);
                    }

                    resolve({ path: outputPath, videoDuration });
                });
                writer.on('error', (err) => {
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



