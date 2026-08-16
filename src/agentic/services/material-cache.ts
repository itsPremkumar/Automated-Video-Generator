/**
 * material-cache.ts — Persistent material cache with TTL and hash-based dedup.
 *
 * Caches downloaded stock media (images, video clips, audio) to avoid
 * re-downloading across runs. Uses content-hash for dedup and TTL for
 * automatic expiration.
 *
 * Identity-preserving: cache is stored in workspace/cache/materials/
 * and is git-ignored. Never breaks a run if cache is corrupted.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logInfo, logWarn } from '../../shared/logging/runtime-logging.js';

export interface CacheEntry {
    url: string;
    localPath: string;
    source: string;
    license?: string;
    licenseUrl?: string;
    size: number;
    hash: string;
    cachedAt: number;
    lastAccessed: number;
}

export interface CacheStats {
    totalEntries: number;
    totalSize: number;
    hitCount: number;
    missCount: number;
}

const CACHE_DIR = path.resolve(process.cwd(), 'workspace', 'cache', 'materials');
const CACHE_INDEX = path.join(CACHE_DIR, 'cache-index.json');
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB

let cache: Map<string, CacheEntry> = new Map();
let hitCount = 0;
let missCount = 0;
let loaded = false;

/** Load cache index from disk */
function loadCache(): void {
    if (loaded) return;
    try {
        if (fs.existsSync(CACHE_INDEX)) {
            const raw = fs.readFileSync(CACHE_INDEX, 'utf-8');
            const data = JSON.parse(raw);
            cache = new Map(Object.entries(data.entries || {}));
            hitCount = data.hitCount || 0;
            missCount = data.missCount || 0;
            logInfo(`[MAT-CACHE] Loaded ${cache.size} entries`);
        }
    } catch (e: any) {
        logWarn(`[MAT-CACHE] Failed to load cache index: ${e?.message ?? e}`);
        cache = new Map();
    }
    loaded = true;
}

/** Save cache index to disk */
function saveCache(): void {
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        const data = {
            entries: Object.fromEntries(cache),
            hitCount,
            missCount,
            savedAt: Date.now(),
        };
        fs.writeFileSync(CACHE_INDEX, JSON.stringify(data, null, 2));
    } catch (e: any) {
        logWarn(`[MAT-CACHE] Failed to save cache index: ${e?.message ?? e}`);
    }
}

/** Compute hash of a URL for cache key */
function hashUrl(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/** Get cached file path for a URL, or null if not cached/expired */
export function getCached(url: string, ttlMs: number = DEFAULT_TTL_MS): string | null {
    loadCache();
    const key = hashUrl(url);
    const entry = cache.get(key);

    if (!entry) {
        missCount++;
        return null;
    }

    // Check TTL
    if (Date.now() - entry.cachedAt > ttlMs) {
        logInfo(`[MAT-CACHE] Entry expired: ${url.slice(0, 60)}`);
        cache.delete(key);
        missCount++;
        return null;
    }

    // Check file exists
    if (!fs.existsSync(entry.localPath)) {
        logWarn(`[MAT-CACHE] File missing for cached URL: ${entry.localPath}`);
        cache.delete(key);
        missCount++;
        return null;
    }

    // Update access time
    entry.lastAccessed = Date.now();
    hitCount++;
    return entry.localPath;
}

/** Add a downloaded file to the cache */
export function putCache(
    url: string,
    localPath: string,
    metadata: { source?: string; license?: string; licenseUrl?: string } = {},
): void {
    loadCache();
    const key = hashUrl(url);

    if (!fs.existsSync(localPath)) {
        logWarn(`[MAT-CACHE] Cannot cache missing file: ${localPath}`);
        return;
    }

    const stat = fs.statSync(localPath);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(localPath)).digest('hex').slice(0, 16);

    const entry: CacheEntry = {
        url,
        localPath,
        source: metadata.source || 'unknown',
        license: metadata.license,
        licenseUrl: metadata.licenseUrl,
        size: stat.size,
        hash,
        cachedAt: Date.now(),
        lastAccessed: Date.now(),
    };

    cache.set(key, entry);
    saveCache();
    logInfo(`[MAT-CACHE] Cached: ${path.basename(localPath)} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
}

/** Get cache statistics */
export function getCacheStats(): CacheStats {
    loadCache();
    let totalSize = 0;
    for (const entry of cache.values()) {
        totalSize += entry.size;
    }
    return {
        totalEntries: cache.size,
        totalSize,
        hitCount,
        missCount,
    };
}

/** Clean up expired entries and enforce size limit */
export function cleanupCache(ttlMs: number = DEFAULT_TTL_MS, maxSize: number = MAX_CACHE_SIZE): void {
    loadCache();
    let cleaned = 0;

    // Remove expired
    for (const [key, entry] of cache.entries()) {
        if (Date.now() - entry.cachedAt > ttlMs) {
            cache.delete(key);
            cleaned++;
        }
    }

    // Enforce size limit (LRU eviction)
    let totalSize = 0;
    const entries: CacheEntry[] = [];
    for (const entry of cache.values()) {
        totalSize += entry.size;
        entries.push(entry);
    }

    if (totalSize > maxSize) {
        // Sort by lastAccessed (oldest first)
        entries.sort((a, b) => a.lastAccessed - b.lastAccessed);
        for (const entry of entries) {
            if (totalSize <= maxSize) break;
            const key = hashUrl(entry.url);
            cache.delete(key);
            totalSize -= entry.size;
            cleaned++;
        }
    }

    if (cleaned > 0) {
        logInfo(`[MAT-CACHE] Cleaned ${cleaned} entries`);
        saveCache();
    }
}

/** Clear entire cache */
export function clearCache(): void {
    cache = new Map();
    hitCount = 0;
    missCount = 0;
    saveCache();
    logInfo('[MAT-CACHE] Cache cleared');
}

/** Get cache directory path */
export function getCacheDir(): string {
    return CACHE_DIR;
}
