/**
 * src/music-system/index.ts
 * Public API for the music system.
 *
 * Export everything a consumer needs. Import from 'src/music-system'
 * for full access, or from 'src/lib/free-music' for backward compat.
 */

// Core engine
export { MusicEngine } from './engine';

// Types
export type {
    MusicTrack,
    MusicQuery,
    ResolvedMusic,
    MusicProvider,
    MusicRole,
    MusicMood,
    MusicIntensity,
    ProcessingOptions,
    ProcessingResult,
    MusicEvent,
    MusicEventType,
    MusicEngineConfig,
    ProviderOverrides,
    ProviderNetworkRequirement,
} from './types';

// Query builder
export { buildMusicQuery, detectMood, detectIntensity } from './query';

// Provider registry
export { globalRegistry, ProviderRegistry } from './providers/registry';
export { registerDefaultProviders } from './providers/index';

// Base provider (for writing custom providers)
export { BaseMusicProvider, probeDuration, runFfmpeg, withSignal } from './providers/base';

// Individual providers (for custom registration)
export { BundledProvider } from './providers/bundled';
export { LocalProvider } from './providers/local';
export { CcMixterProvider } from './providers/ccmixter';
export { PixabayProvider } from './providers/pixabay'; // NOTE: requires API key, not in default chain
export { OpenLofiProvider } from './providers/open-lofi';
export { InternetArchiveProvider } from './providers/internet-archive';
export { ProceduralProvider } from './providers/procedural';

// Processing
export { ProcessingPipeline } from './processing/index';
export { trimAudio } from './processing/trim';
export { applyFade } from './processing/fade';
export { normalizeLoudness } from './processing/normalize';
export { loopAudio } from './processing/looper';

// Events
export { MusicEventBus, globalEventBus } from './events';

// Cache
export { MusicCache } from './cache';

// Config
export { loadMusicConfig, resolveMusicPath } from './config';

// Errors
export {
    MusicSystemError,
    ProviderError,
    ConfigError,
    CacheError,
    ProcessingError,
    NoMusicFoundError,
} from './errors';
