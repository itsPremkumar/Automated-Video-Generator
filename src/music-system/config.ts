/**
 * src/music-system/config.ts
 * Configuration loading — hierarchical: defaults → env → file → runtime overrides.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MusicEngineConfig, ProviderOverrides } from './types';
import { DEFAULT_CONFIG, DEFAULT_PROCESSING } from './types';
import { ConfigError } from './errors';

/** Resolve project root by walking up from __dirname or cwd */
function findProjectRoot(start: string): string {
    let dir = path.resolve(start);
    for (let i = 0; i < 20; i++) {
        if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return process.cwd();
}

const PROJECT_ROOT = findProjectRoot(__dirname);

/** Return a resolved config merging all layers. */
export function loadMusicConfig(overrides?: Partial<MusicEngineConfig>): MusicEngineConfig {
    // 1. Start with defaults
    const cfg: MusicEngineConfig = {
        ...DEFAULT_CONFIG,
        cacheDir: DEFAULT_CONFIG.cacheDir || path.join(PROJECT_ROOT, 'workspace', 'cache', 'free-music'),
        processing: { ...DEFAULT_PROCESSING },
        providers: { ...DEFAULT_CONFIG.providers },
    };

    // 2. Environment variable overrides
    if (process.env.MUSIC_ENABLED !== undefined) {
        cfg.enabled = process.env.MUSIC_ENABLED.toLowerCase() !== 'false';
    }
    if (process.env.MUSIC_CACHE_DIR) {
        cfg.cacheDir = path.resolve(PROJECT_ROOT, process.env.MUSIC_CACHE_DIR);
    }
    if (process.env.MUSIC_PROVIDER_TIMEOUT) {
        cfg.providerTimeout = parseInt(process.env.MUSIC_PROVIDER_TIMEOUT, 10) || cfg.providerTimeout;
    }
    if (process.env.MUSIC_PARALLEL !== undefined) {
        cfg.parallelSearch = process.env.MUSIC_PARALLEL.toLowerCase() !== 'false';
    }

    // 3. Config file (optional)
    const configPaths = [
        path.join(PROJECT_ROOT, 'music-config.json'),
        path.join(PROJECT_ROOT, 'config', 'music.json'),
    ];
    for (const cp of configPaths) {
        if (fs.existsSync(cp)) {
            try {
                const fileCfg = JSON.parse(fs.readFileSync(cp, 'utf-8'));
                applyPartial(cfg, fileCfg);
            } catch (e: any) {
                throw new ConfigError(`Failed to load config from ${cp}: ${e.message}`);
            }
        }
    }

    // 4. Runtime overrides (highest priority)
    if (overrides) {
        applyPartial(cfg, overrides);
    }

    // Ensure cache dir exists
    if (cfg.cacheDir) {
        fs.mkdirSync(cfg.cacheDir, { recursive: true });
    }

    return cfg;
}

/** Deep-merge a partial config onto a full config (preserves unset fields). */
function applyPartial(target: MusicEngineConfig, partial: Record<string, any>): void {
    if (partial.enabled !== undefined) target.enabled = partial.enabled;
    if (partial.cacheDir !== undefined) target.cacheDir = partial.cacheDir;
    if (partial.providerTimeout !== undefined) target.providerTimeout = partial.providerTimeout;
    if (partial.parallelSearch !== undefined) target.parallelSearch = partial.parallelSearch;

    if (partial.processing) {
        Object.assign(target.processing, partial.processing);
    }
    if (partial.providers) {
        if (!target.providers) target.providers = {};
        for (const key of Object.keys(partial.providers)) {
            (target.providers as Record<string, any>)[key] = {
                ...(target.providers as any)?.[key],
                ...partial.providers[key],
            };
        }
    }
}

/** Resolve a path relative to the project root */
export function resolveMusicPath(relative: string): string {
    return path.resolve(PROJECT_ROOT, relative);
}

export { PROJECT_ROOT as MUSIC_PROJECT_ROOT };
