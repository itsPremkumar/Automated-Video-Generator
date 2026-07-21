import * as fs from 'fs';
import { resolveWorkspacePath } from '../../runtime';
import { MediaAsset, VideoCache } from './types';

export const CACHE_FILE = resolveWorkspacePath('cache', 'video-cache.json');
export const CACHE_MAX_ENTRIES = 2000;

export function buildCacheKey(
    query: string,
    orientation: 'portrait' | 'landscape' | 'none',
    mediaType: MediaAsset['type'],
): string {
    return `${mediaType}:${query.toLowerCase()}:${orientation}`;
}

export function buildLegacyCacheKey(
    query: string,
    orientation: 'portrait' | 'landscape' | 'none',
): string {
    return `${query.toLowerCase()}:${orientation}`;
}

function loadCache(): VideoCache {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        }
    } catch {
        // ignore corrupt cache
    }
    return {};
}

let inMemoryCache: VideoCache | null = null;

export function getCache(): VideoCache {
    if (inMemoryCache) return inMemoryCache;
    inMemoryCache = loadCache();
    return inMemoryCache;
}

export function saveCache(cache: VideoCache): void {
    try {
        let keys = Object.keys(cache);
        if (keys.length > CACHE_MAX_ENTRIES) {
            const overflow = keys.length - CACHE_MAX_ENTRIES;
            for (const k of keys.slice(0, overflow)) delete cache[k];
            keys = Object.keys(cache);
        }
        const payload = JSON.stringify(cache, null, 2);
        const tmp = `${CACHE_FILE}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, payload);
        fs.renameSync(tmp, CACHE_FILE);
    } catch {
        // silently ignore cache write failures
    }
}

export function resetInMemoryCache(): void {
    inMemoryCache = {};
    if (fs.existsSync(CACHE_FILE)) {
        try {
            fs.unlinkSync(CACHE_FILE);
        } catch {
            /* ignore */
        }
    }
}

export function invalidateCachedVisual(
    keywords: string[],
    orientation: 'portrait' | 'landscape' = 'portrait',
): void {
    const query = keywords.join(' ');
    const cache = getCache();
    const cacheKeys = [
        buildCacheKey(query, orientation, 'video'),
        buildCacheKey(query, orientation, 'image'),
        buildLegacyCacheKey(query, orientation),
    ];

    let changed = false;
    for (const cacheKey of cacheKeys) {
        if (cache[cacheKey]) {
            delete cache[cacheKey];
            changed = true;
        }
    }

    if (changed) {
        saveCache(cache);
    }
}
