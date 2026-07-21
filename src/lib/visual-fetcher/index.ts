/**
 * visual-fetcher — multi-platform media search, caching, and downloading.
 *
 * This module is the public API for all visual media fetching in the
 * Automated Video Generator. It splits logically into:
 *
 *  types.ts        — MediaAsset, VideoMetadata, DownloadResult, VideoCache interfaces
 *  cache.ts        — in-memory + JSON-file cache for search results
 *  media-utils.ts  — ffprobe metadata, quality ranking, video sorting
 *  keyword-utils.ts— Gemini keyword optimization, keyword list parsing
 *  search.ts       — Pexels/Pixabay/free video/image search, fetchVisualsForScene
 *  download.ts     — download media with caching and stall detection
 *
 * All public exports from the original monolithic visual-fetcher.ts are
 * re-exported here so existing imports keep working without changes.
 */

// Re-export the free-image adapter for convenience
export { freeImageAdapter } from '../free-image/index';

// Types
export { MediaAsset, VideoMetadata, DownloadResult } from './types';

// Cache management
export {
    resetInMemoryCache,
    invalidateCachedVisual,
    getCache,
    saveCache,
    CACHE_FILE,
} from './cache';

// Media metadata and utilities
export {
    parsePositiveNumber,
    parsePositiveInteger,
    parseFrameRate,
    estimateVideoDurationFromSize,
    calculateSafeTrimAfterFrames,
    getVideoMetadata,
    getVideoDuration,
    getQualityRank,
    selectBestVideoFile,
    sortVideoAssets,
    DEFAULT_RENDER_FPS,
    SAFE_VIDEO_END_BUFFER_FRAMES,
    TARGET_VIDEO_DURATION_SECONDS,
    PREFERRED_QUALITIES,
    MIN_WIDTH,
    TARGET_RENDER_WIDTH,
    sleep,
} from './media-utils';

// Keyword utilities
export {
    normalizeKeywordList,
    parseGeminiKeywordResponse,
    shouldRetryGeminiRequest,
    formatGeminiError,
} from './keyword-utils';

// Search functions
export {
    searchVideos,
    searchImages,
    searchFreeImages,
    searchPixabayVideos,
    fetchVisualsForScene,
    optimizeKeywordsWithGemini,
} from './search';

// Download
export {
    downloadMedia,
    MAX_DOWNLOAD_BYTES,
    DOWNLOAD_STALL_TIMEOUT_MS,
} from './download';
