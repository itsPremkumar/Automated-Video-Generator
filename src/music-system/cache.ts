/**
 * src/music-system/cache.ts
 * Multi-level cache: memory (per-session) → disk (cross-session).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MusicTrack } from './types';
import { CacheError } from './errors';

interface CacheEntry {
    /** Absolute path to cached file */
    localPath: string;
    /** When it was cached (ms since epoch) */
    cachedAt: number;
    /** Original track metadata */
    track: MusicTrack;
}

export class MusicCache {
    private memoryCache = new Map<string, CacheEntry>();
    private readonly diskDir: string;

    constructor(diskDir: string) {
        this.diskDir = diskDir;
        fs.mkdirSync(this.diskDir, { recursive: true });
    }

    /** Generate a stable cache key for a track */
    static cacheKey(track: MusicTrack): string {
        // provider + id uniquely identifies a track
        const raw = `${track.provider}::${track.id}`;
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
            const c = raw.charCodeAt(i);
            hash = ((hash << 5) - hash) + c;
            hash |= 0; // Convert to 32bit integer
        }
        return `${track.provider}_${Math.abs(hash).toString(36)}`;
    }

    /** Check if a track is already cached (memory first, then disk) */
    get(track: MusicTrack): string | null {
        const key = MusicCache.cacheKey(track);

        // 1. Memory
        const mem = this.memoryCache.get(key);
        if (mem && fs.existsSync(mem.localPath)) {
            return mem.localPath;
        }

        // 2. Disk
        const diskPath = this.resolveDiskPath(key, track.format);
        if (fs.existsSync(diskPath) && fs.statSync(diskPath).size > 1024) {
            this.memoryCache.set(key, {
                localPath: diskPath,
                cachedAt: Date.now(),
                track,
            });
            return diskPath;
        }

        return null;
    }

    /** Store a file in cache */
    set(track: MusicTrack, localPath: string): string {
        const key = MusicCache.cacheKey(track);
        const dest = this.resolveDiskPath(key, track.format);

        // Copy to cache dir if not already there
        if (path.dirname(localPath) !== this.diskDir) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(localPath, dest);
        }

        this.memoryCache.set(key, {
            localPath: dest,
            cachedAt: Date.now(),
            track,
        });

        return dest;
    }

    /** Remove a cached track */
    invalidate(track: MusicTrack): void {
        const key = MusicCache.cacheKey(track);
        this.memoryCache.delete(key);
        const diskPath = this.resolveDiskPath(key, track.format);
        try { fs.unlinkSync(diskPath); } catch { /* ignore */ }
    }

    /** Clear entire cache */
    clear(): void {
        this.memoryCache.clear();
        try {
            const entries = fs.readdirSync(this.diskDir);
            for (const e of entries) {
                const fp = path.join(this.diskDir, e);
                if (fp.endsWith('.mp3') || fp.endsWith('.wav') || fp.endsWith('.ogg')) {
                    fs.unlinkSync(fp);
                }
            }
        } catch {
            // best effort
        }
    }

    private resolveDiskPath(key: string, format: string): string {
        return path.join(this.diskDir, `${key}.${format}`);
    }

    /** Size of disk cache in bytes */
    get diskSize(): number {
        let total = 0;
        try {
            for (const e of fs.readdirSync(this.diskDir)) {
                const fp = path.join(this.diskDir, e);
                try { total += fs.statSync(fp).size; } catch { /* skip */ }
            }
        } catch { /* skip */ }
        return total;
    }

    /** Number of entries in disk cache */
    get diskEntries(): number {
        try {
            return fs.readdirSync(this.diskDir).length;
        } catch {
            return 0;
        }
    }
}
