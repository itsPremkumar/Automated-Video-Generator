/**
 * src/music-system/engine.ts
 * MusicEngine — the main orchestrator. Resolves music from providers,
 * processes it, and returns a ready-to-use local file.
 *
 * Usage:
 *   const engine = new MusicEngine();
 *   await engine.init();
 *   const music = await engine.resolveBackground({ topic: 'nature' });
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
    MusicQuery,
    MusicTrack,
    ResolvedMusic,
    MusicRole,
    MusicProvider,
    MusicEvent,
    MusicEngineConfig,
    ProcessingOptions,
} from './types';
import { loadMusicConfig } from './config';
import { MusicCache } from './cache';
import { MusicEventBus, globalEventBus } from './events';
import { buildMusicQuery } from './query';
import { globalRegistry } from './providers/registry';
import { registerDefaultProviders } from './providers/index';
import { ProcessingPipeline } from './processing/index';
import { probeDuration, withSignal } from './providers/base';

export class MusicEngine {
    private config: MusicEngineConfig;
    private cache: MusicCache;
    private eventBus: MusicEventBus;
    private processingPipeline: ProcessingPipeline;
    private initialized = false;

    constructor(config?: Partial<MusicEngineConfig>) {
        this.config = loadMusicConfig(config);
        this.cache = new MusicCache(this.config.cacheDir);
        this.eventBus = globalEventBus;
        this.processingPipeline = new ProcessingPipeline(this.config.processing);
    }

    /**
     * Initialize the engine: register default providers if none exist.
     * Safe to call multiple times.
     */
    async init(): Promise<void> {
        if (this.initialized) return;

        if (globalRegistry.size === 0) {
            registerDefaultProviders();
        }

        this.initialized = true;
    }

    /** Subscribe to engine events */
    on(cb: (event: MusicEvent) => void): () => void {
        return this.eventBus.onAny(cb);
    }

    /** Get the config (read-only snapshot) */
    getConfig(): MusicEngineConfig {
        return { ...this.config };
    }

    /** Register a custom provider */
    registerProvider(provider: MusicProvider): void {
        globalRegistry.register(provider);
    }

    /** Disable a specific provider by name */
    disableProvider(name: string): void {
        globalRegistry.unregister(name);
    }

    /**
     * Resolve music for a specific role.
     * This is the main entry point for all music resolution.
     */
    async resolveForRole(
        queryInput: Partial<MusicQuery>,
        role: MusicRole,
        configOverride?: Partial<MusicEngineConfig>,
    ): Promise<ResolvedMusic | null> {
        if (!this.config.enabled) return null;

        const query = buildMusicQuery({
            ...queryInput,
            role,
            targetDurationSec: queryInput.targetDurationSec || 60,
            minDurationSec: queryInput.minDurationSec || 30,
        });

        const startTime = Date.now();

        // Determine which providers to try
        const allProviders = globalRegistry.getAll();
        const candidates: Array<{ provider: MusicProvider; track: MusicTrack }> = [];

        // Try providers in priority order (first match wins)
        for (const provider of allProviders) {
            try {
                const tracks = await this.searchProvider(provider, query);
                if (tracks.length > 0) {
                    candidates.push({ provider, track: tracks[0] });
                    this.eventBus.emit({
                        type: 'track:selected',
                        provider: provider.name,
                        track: tracks[0],
                    });

                    // If this is a high-priority offline provider, take it immediately
                    if (!provider.requiresNetwork) {
                        break;
                    }
                }
            } catch (err: any) {
                this.eventBus.emit({
                    type: 'provider:search:fail',
                    provider: provider.name,
                    error: err.message,
                });
            }
        }

        // If we have candidates, download + process the best one
        if (candidates.length > 0) {
            const best = candidates[0];
            return this.downloadAndProcess(best.track, best.provider, query, startTime);
        }

        // Last resort: procedural generator (always works)
        this.eventBus.emit({ type: 'engine:fallback', error: 'All providers failed, using procedural' });
        const proceduralProvider = globalRegistry.get('procedural');
        if (proceduralProvider) {
            try {
                const tracks = await proceduralProvider.search(query);
                if (tracks.length > 0) {
                    return this.downloadAndProcess(tracks[0], proceduralProvider, query, startTime);
                }
            } catch (err: any) {
                this.eventBus.emit({
                    type: 'engine:error',
                    error: `Procedural fallback also failed: ${err.message}`,
                });
            }
        }

        this.eventBus.emit({ type: 'engine:complete' });
        return null;
    }

    /**
     * Convenience: resolve background music (most common use).
     * @param opts  Partial query fields (topic, mood, duration, etc.)
     */
    async resolveBackground(opts: {
        topic?: string;
        voiceoverText?: string;
        mood?: string;
        targetDurationSec?: number;
    }): Promise<ResolvedMusic | null> {
        return this.resolveForRole(
            {
                topic: opts.topic,
                voiceoverText: opts.voiceoverText,
                mood: opts.mood as any,
                targetDurationSec: opts.targetDurationSec,
            },
            'background',
        );
    }

    /**
     * Convenience: resolve intro music.
     */
    async resolveIntro(opts: {
        topic?: string;
        targetDurationSec?: number;
    }): Promise<ResolvedMusic | null> {
        return this.resolveForRole(
            {
                topic: opts.topic,
                mood: 'upbeat',
                targetDurationSec: opts.targetDurationSec || 4,
                minDurationSec: 2,
            },
            'intro',
        );
    }

    /**
     * Convenience: resolve outro music.
     */
    async resolveOutro(opts: {
        topic?: string;
        targetDurationSec?: number;
    }): Promise<ResolvedMusic | null> {
        return this.resolveForRole(
            {
                topic: opts.topic,
                mood: 'dramatic',
                targetDurationSec: opts.targetDurationSec || 6,
                minDurationSec: 3,
            },
            'outro',
        );
    }

    // ─── Private Helpers ──────────────────────────────────────────

    private async searchProvider(
        provider: MusicProvider,
        query: MusicQuery,
    ): Promise<MusicTrack[]> {
        this.eventBus.emit({
            type: 'provider:search:start',
            provider: provider.name,
        });

        const start = Date.now();
        try {
            const tracks = await provider.search(query);
            this.eventBus.emit({
                type: 'provider:search:success',
                provider: provider.name,
                latencyMs: Date.now() - start,
            });
            return tracks;
        } catch (err: any) {
            this.eventBus.emit({
                type: 'provider:search:fail',
                provider: provider.name,
                latencyMs: Date.now() - start,
                error: err.message,
            });
            throw err;
        }
    }

    private async downloadAndProcess(
        track: MusicTrack,
        provider: MusicProvider,
        query: MusicQuery,
        startTime: number,
    ): Promise<ResolvedMusic> {
        // 1. Check cache
        const cached = this.cache.get(track);
        let localPath: string;

        if (cached) {
            this.eventBus.emit({
                type: 'track:cached',
                provider: provider.name,
                track,
            });
            localPath = cached;
        } else {
            // 2. Download
            this.eventBus.emit({
                type: 'track:downloading',
                provider: provider.name,
                track,
            });

            const destDir = path.join(this.config.cacheDir, 'downloads');
            fs.mkdirSync(destDir, { recursive: true });
            const destFile = path.join(destDir, `${MusicCache.cacheKey(track)}.${track.format}`);

            localPath = await provider.download(track, destFile);

            this.eventBus.emit({
                type: 'track:downloaded',
                provider: provider.name,
                track,
            });

            // Store in cache
            this.cache.set(track, localPath);
        }

        // 3. Process
        this.eventBus.emit({
            type: 'track:processing',
            provider: provider.name,
            track,
        });

        const finalPath = path.join(this.config.cacheDir, 'processed', `${MusicCache.cacheKey(track)}_processed.wav`);
        const processing = await this.processingPipeline.run(localPath, finalPath, {
            role: query.role,
            targetDurationSec: query.targetDurationSec,
        });

        this.eventBus.emit({
            type: 'track:processed',
            provider: provider.name,
            track,
        });

        const resolved: ResolvedMusic = {
            localPath: finalPath,
            track,
            role: query.role,
            processing,
            latencyMs: Date.now() - startTime,
        };

        this.eventBus.emit({ type: 'engine:complete', latencyMs: resolved.latencyMs });
        return resolved;
    }
}
