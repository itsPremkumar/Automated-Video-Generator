/**
 * Shared asset cache for batch deduplication.
 *
 * When running multiple jobs in a batch, the same stock assets (images, videos,
 * music) are often fetched repeatedly. This module provides a content-addressable
 * cache so that once an asset is downloaded for one job, it's reused for all
 * subsequent jobs — reducing network calls, RAM usage, and render time.
 *
 * Cache layout:
 *   workspace/assets/cache/
 *     <sha256-of-url>/           — the actual asset file(s)
 *     index.json                 — URL → cache path mapping
 *
 * Zero-config: if the cache dir doesn't exist, it's created. If a cache entry
 * is stale (file missing), it's transparently re-fetched.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { resolveProjectPath } from '../../shared/runtime/paths.js';

const CACHE_ROOT = resolveProjectPath('workspace', 'assets', 'cache');
const INDEX_FILE = path.join(CACHE_ROOT, 'index.json');

interface CacheEntry {
    url: string;
    localPath: string;
    source: string;
    license?: string;
    licenseUrl?: string;
    fileSize: number;
    downloadedAt: string;
    sha256: string;
}

interface CacheIndex {
    [url: string]: CacheEntry;
}

/**
 * Load the cache index from disk. Returns an empty index if the file doesn't
 * exist or is corrupt.
 */
function loadIndex(): CacheIndex {
    try {
        if (!fs.existsSync(INDEX_FILE)) return {};
        const raw = fs.readFileSync(INDEX_FILE, 'utf-8');
        return JSON.parse(raw) as CacheIndex;
    } catch {
        return {};
    }
}

/**
 * Persist the cache index to disk.
 */
function saveIndex(index: CacheIndex): void {
    try {
        fs.mkdirSync(CACHE_ROOT, { recursive: true });
        fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
    } catch {
        /* cache is best-effort */
    }
}

/**
 * Compute SHA-256 hash of a file for content-addressable storage.
 */
function hashFile(filePath: string): string | null {
    try {
        const buf = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(buf).digest('hex');
    } catch {
        return null;
    }
}

/**
 * Get the cache path for a URL. Uses SHA-256 of the URL for a stable,
 * collision-free directory name.
 */
function cachePathForUrl(url: string, ext: string): string {
    const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
    return path.join(CACHE_ROOT, hash + ext);
}

/**
 * Check if a URL is already cached and the file exists on disk.
 * Returns the cache entry if valid, null otherwise.
 */
export function getCached(url: string): CacheEntry | null {
    const index = loadIndex();
    const entry = index[url];
    if (!entry) return null;
    if (!fs.existsSync(entry.localPath)) {
        // Stale entry — file was deleted. Remove from index.
        delete index[url];
        saveIndex(index);
        return null;
    }
    // Verify file integrity via size check
    try {
        const stat = fs.statSync(entry.localPath);
        if (stat.size !== entry.fileSize) {
            delete index[url];
            saveIndex(index);
            return null;
        }
    } catch {
        return null;
    }
    return entry;
}

/**
 * Store a downloaded file in the cache. The file is copied (not moved) so the
 * original path remains valid. Returns the cache entry.
 */
export function putCache(
    url: string,
    sourcePath: string,
    metadata: { source: string; license?: string; licenseUrl?: string },
): CacheEntry | null {
    try {
        if (!fs.existsSync(sourcePath)) return null;

        const stat = fs.statSync(sourcePath);
        const ext = path.extname(sourcePath) || '.bin';
        const cachePath = cachePathForUrl(url, ext);

        // If cache already has this file (by URL), skip copy
        const index = loadIndex();
        if (index[url] && fs.existsSync(index[url].localPath)) {
            return index[url];
        }

        // If the source and cache paths are the same, skip copy
        if (path.resolve(sourcePath) === path.resolve(cachePath)) {
            // Already in cache
        } else {
            fs.mkdirSync(path.dirname(cachePath), { recursive: true });
            fs.copyFileSync(sourcePath, cachePath);
        }

        const sha = hashFile(cachePath);
        const entry: CacheEntry = {
            url,
            localPath: cachePath,
            source: metadata.source,
            license: metadata.license,
            licenseUrl: metadata.licenseUrl,
            fileSize: stat.size,
            downloadedAt: new Date().toISOString(),
            sha256: sha || '',
        };

        index[url] = entry;
        saveIndex(index);
        return entry;
    } catch {
        return null;
    }
}

/**
 * Get cache statistics for monitoring.
 */
export function cacheStats(): { entries: number; totalSize: number; cacheDir: string } {
    const index = loadIndex();
    const entries = Object.keys(index);
    let totalSize = 0;
    for (const url of entries) {
        const entry = index[url];
        if (fs.existsSync(entry.localPath)) {
            try {
                totalSize += fs.statSync(entry.localPath).size;
            } catch {
                /* ignore */
            }
        }
    }
    return { entries: entries.length, totalSize, cacheDir: CACHE_ROOT };
}

/**
 * Clear the entire cache. Use with caution — this deletes all cached assets.
 */
export function clearCache(): number {
    const index = loadIndex();
    let removed = 0;
    for (const url of Object.keys(index)) {
        const entry = index[url];
        try {
            if (fs.existsSync(entry.localPath)) {
                fs.rmSync(entry.localPath, { force: true });
                removed++;
            }
        } catch {
            /* ignore */
        }
    }
    try {
        if (fs.existsSync(CACHE_ROOT)) {
            fs.rmSync(CACHE_ROOT, { recursive: true, force: true });
        }
    } catch {
        /* ignore */
    }
    return removed;
}
