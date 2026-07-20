/**
 * asset-cache.ts — global, disk-backed asset cache.
 *
 * Many agentic jobs fetch the SAME free assets (Pexels photos, free-music
 * tracks, Openverse hits). Re-downloading every job wastes bandwidth and
 * slows batches. This cache stores each asset once, keyed by a hash of its
 * source URL, under a shared directory:
 *
 *   workspace/cache/<sha256(url)><ext>
 *
 * Zero cost, offline-safe:
 *  - If the cached file exists and is non-trivial, return it without network.
 *  - On a fresh download, copy the result into the cache for next time.
 *  - `getCached(url)` never throws; on any miss/error it returns null and the
 *    caller falls back to a live download.
 *  - Optional TTL: a cached entry older than `ttlMs` is treated as a miss
 *    (set ttlMs: 0 to cache forever).
 *
 * All functions are synchronous-ish (fs only) and safe to call from async code.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'workspace', 'cache');

function keyFor(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
}

function extFor(url: string): string {
    const clean = url.split('?')[0].split('#')[0];
    const m = clean.match(/\.[a-zA-Z0-9]{1,5}$/);
    return m ? m[0].toLowerCase() : '';
}

function cachePath(url: string): string {
    return path.join(CACHE_DIR, keyFor(url) + extFor(url));
}

/** Look up a cached asset. Returns the local path if present + fresh, else null. */
export function getCached(url: string, ttlMs?: number): string | null {
    try {
        const p = cachePath(url);
        if (!fs.existsSync(p)) return null;
        const st = fs.statSync(p);
        if (st.size < 500) return null; // too small to be a real asset
        if (ttlMs && ttlMs > 0 && Date.now() - st.mtimeMs > ttlMs) return null;
        return p;
    } catch {
        return null;
    }
}

/** Store a downloaded file into the cache (best-effort; ignores errors). */
export function storeCached(url: string, srcPath: string): void {
    try {
        if (!fs.existsSync(srcPath)) return;
        if (fs.statSync(srcPath).size < 500) return;
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.copyFileSync(srcPath, cachePath(url));
    } catch {
        /* best-effort */
    }
}

/** Total bytes stored in the cache (for diagnostics / prune). */
export function cacheSizeBytes(): number {
    try {
        if (!fs.existsSync(CACHE_DIR)) return 0;
        let total = 0;
        for (const f of fs.readdirSync(CACHE_DIR)) {
            try {
                total += fs.statSync(path.join(CACHE_DIR, f)).size;
            } catch {
                /* skip */
            }
        }
        return total;
    } catch {
        return 0;
    }
}

/** Remove all cached assets (best-effort). */
export function clearCache(): void {
    try {
        if (fs.existsSync(CACHE_DIR)) fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    } catch {
        /* ignore */
    }
}
