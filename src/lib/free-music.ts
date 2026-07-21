/**
 * src/lib/free-music.ts
 *
 * ╔════════════════════════════════════════════════════════════╗
 * ║  BACKWARD-COMPATIBLE SHIM                                 ║
 * ║                                                            ║
 * ║  This file is preserved for existing callers. All new      ║
 * ║  code should import from the new architecture:             ║
 * ║    import { MusicEngine } from '../music-system';          ║
 * ║                                                            ║
 * ║  Legacy callers continue working unchanged.                ║
 * ╚════════════════════════════════════════════════════════════╝
 *
 * Resolves background music from free/offline sources.
 * Uses the new music-system architecture internally.
 *
 * *From the plan:* "Designed to be additive and non-breaking:
 * returns null on any failure so the caller simply proceeds
 * without music."
 */

import { MusicEngine } from '../music-system/engine';
import { registerDefaultProviders } from '../music-system/providers/index';
import type { MusicTrack as NewMusicTrack } from '../music-system/types';
import { logInfo, logWarn, resolveProjectPath } from '../runtime';

const console = {
    log: (...args: unknown[]) => logInfo('[FREE-MUSIC]', ...args),
    warn: (...args: unknown[]) => logWarn('[FREE-MUSIC]', ...args),
};

// ─── Backward-Compatible Types ────────────────────────────────────

export interface FreeMusicTrack {
    id: string;
    title: string;
    creator: string;
    license: string;
    licenseUrl: string;
    provider: string;
    downloadUrl: string;
    genre: string;
    format: string;
    tags: string[];
}

export interface FreeMusicProvider {
    readonly name: string;
    search(query: string, count?: number): Promise<FreeMusicTrack[]>;
}

export interface ResolveFreeMusicOptions {
    query?: string;
    cacheDir?: string;
    preferProviders?: string[];
    enabled?: boolean;
}

export interface ResolvedFreeMusic {
    localPath: string;
    track: FreeMusicTrack;
}

// ─── Backward-Compatible Classes ──────────────────────────────────

export class LocalFreeProvider implements FreeMusicProvider {
    readonly name = 'local';
    async search(query: string, count = 5): Promise<FreeMusicTrack[]> {
        // Delegate to new LocalProvider
        const { LocalProvider } = require('../music-system/providers/local');
        const provider = new LocalProvider();
        const newTracks = await provider.search({ mood: 'any', targetDurationSec: 30, minDurationSec: 1, role: 'background' }, count);
        return newTracks.map(mapToLegacy);
    }
}

export class OpenLofiProvider implements FreeMusicProvider {
    readonly name = 'open-lofi';
    async search(query: string, count = 5): Promise<FreeMusicTrack[]> {
        const { OpenLofiProvider: NewProvider } = require('../music-system/providers/open-lofi');
        const provider = new NewProvider();
        const newTracks = await provider.search({ mood: 'any', topic: query, targetDurationSec: 30, minDurationSec: 1, role: 'background' }, count);
        return newTracks.map(mapToLegacy);
    }
}

export class InternetArchiveProvider implements FreeMusicProvider {
    readonly name = 'internet-archive';
    async search(query: string, count = 5): Promise<FreeMusicTrack[]> {
        const { InternetArchiveProvider: NewProvider } = require('../music-system/providers/internet-archive');
        const provider = new NewProvider();
        const newTracks = await provider.search({ mood: 'any', topic: query, targetDurationSec: 30, minDurationSec: 1, role: 'background' }, count);
        return newTracks.map(mapToLegacy);
    }
}

export class FallbackToneProvider implements FreeMusicProvider {
    readonly name = 'fallback-ambient';
    async search(_query: string, _count = 1): Promise<FreeMusicTrack[]> {
        return [{
            id: 'fallback_ambient_drone',
            title: 'Ambient Drone (Fallback)',
            creator: 'Generated (CC0)',
            license: 'CC0 1.0 Universal (Public Domain)',
            licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
            provider: this.name,
            downloadUrl: '__ffmpeg_generated__',
            genre: 'ambient',
            format: 'wav',
            tags: ['ambient', 'drone', 'fallback', 'generated'],
        }];
    }

    /** Generate a gentle ambient drone tone via ffmpeg. Returns the output path. */
    generate(destPath: string, durationSeconds: number = 30): Promise<string> {
        const { ProceduralProvider } = require('../music-system/providers/procedural');
        const provider = new ProceduralProvider();
        return provider.generate(destPath, {
            mood: 'calm',
            targetDurationSec: durationSeconds,
            minDurationSec: 1,
            role: 'background',
        });
    }
}

// ─── Internal Engine (initialized once) ───────────────────────────

let _engine: MusicEngine | null = null;

function ensureEngine(): MusicEngine {
    if (!_engine) {
        _engine = new MusicEngine({ enabled: true });
        // Don't call init() — the module-level singleton should be
        // lightweight. Providers get registered on first resolve.
        registerDefaultProviders();
    }
    return _engine;
}

// ─── Legacy Helpers ───────────────────────────────────────────────

function defaultProviders(): FreeMusicProvider[] {
    return [
        new LocalFreeProvider(),
        new OpenLofiProvider(),
        new InternetArchiveProvider(),
        new FallbackToneProvider(),
    ];
}

function mapToNew(track: FreeMusicTrack): NewMusicTrack {
    return {
        id: track.id,
        title: track.title,
        creator: track.creator,
        license: track.license,
        licenseUrl: track.licenseUrl,
        provider: track.provider,
        downloadUrl: track.downloadUrl,
        genre: track.genre,
        format: track.format,
        tags: track.tags,
        durationSec: 0,
    };
}

function mapToLegacy(track: NewMusicTrack): FreeMusicTrack {
    return {
        id: track.id,
        title: track.title,
        creator: track.creator,
        license: track.license,
        licenseUrl: track.licenseUrl,
        provider: track.provider,
        downloadUrl: track.downloadUrl,
        genre: track.genre,
        format: track.format,
        tags: track.tags,
    };
}

function sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

// ─── Public API (Backward-Compatible) ─────────────────────────────

export function listFreeMusicProviders(): string[] {
    return defaultProviders().map((p) => p.name);
}

export async function resolveFreeBackgroundMusic(
    opts: ResolveFreeMusicOptions = {},
): Promise<ResolvedFreeMusic | null> {
    const enabled = opts.enabled ?? (process.env.AUTO_FREE_MUSIC ?? 'true').toLowerCase() !== 'false';
    if (!enabled) {
        console.log('Auto free-music disabled (AUTO_FREE_MUSIC=false).');
        return null;
    }

    const query = opts.query?.trim() || 'ambient lofi chill';

    // Try the new engine first
    try {
        await ensureEngine().init();
        const result = await ensureEngine().resolveBackground({
            topic: query,
            targetDurationSec: 60,
        });

        if (result) {
            console.log(`  ♪ Auto-selected free music: ${result.track.title} (${result.track.provider})`);
            return {
                localPath: result.localPath,
                track: mapToLegacy(result.track),
            };
        }
    } catch (err: any) {
        console.warn(`Music engine failed, falling back to legacy providers: ${err.message}`);
    }

    // Legacy fallback path (iterates providers sequentially)
    const cacheDir = opts.cacheDir || resolveProjectPath('workspace', 'cache', 'free-music');
    const providers = opts.preferProviders
        ? defaultProviders().filter((p) => opts.preferProviders!.includes(p.name))
        : defaultProviders();

    let lastError: string | null = null;
    for (const provider of providers) {
        try {
            const tracks = await provider.search(query, 5);
            if (tracks.length === 0) continue;
            const track = tracks[0];

            // Special fallback: ffmpeg-generated ambient tone
            if (track.downloadUrl === '__ffmpeg_generated__') {
                console.warn('  ↳ No external music sources available, generating ambient audio tone…');
                const cacheFile = require('path').join(cacheDir, 'fallback_ambient.wav');
                const fs = require('fs');
                if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 1024) {
                    console.log(`Reusing cached fallback ambient: ${cacheFile}`);
                    return { localPath: cacheFile, track };
                }
                fs.mkdirSync(cacheDir, { recursive: true });
                const ft = new FallbackToneProvider();
                await ft.generate(cacheFile);
                return { localPath: cacheFile, track };
            }

            const ext = track.format || 'mp3';
            const cacheFile = require('path').join(cacheDir, `${sanitizeId(track.id)}.${ext}`);
            const fs = require('fs');
            if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 1024) {
                console.log(`Reusing cached free music: ${track.title} (${track.provider})`);
                return { localPath: cacheFile, track };
            }

            // Download track (copied from old logic)
            const axios = require('axios');
            const res = await axios.get(track.downloadUrl, { responseType: 'arraybuffer', timeout: 15000 });
            const buf = Buffer.from(res.data);
            if (!buf || buf.length < 1024) throw new Error(`Downloaded file too small for ${track.title}`);
            fs.mkdirSync(require('path').dirname(cacheFile), { recursive: true });
            fs.writeFileSync(cacheFile, buf);

            console.log(`Auto-selected free music: ${track.title} (${track.provider}, ${track.license})`);
            return { localPath: cacheFile, track };
        } catch (err: any) {
            lastError = err?.message || String(err);
            console.warn(`Provider ${provider.name} failed: ${lastError}`);
        }
    }

    if (lastError) console.warn(`Free music resolution failed: ${lastError}`);
    return null;
}
