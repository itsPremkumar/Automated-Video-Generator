/**
 * src/music-system/errors.ts
 * Typed errors for the music system — clean error hierarchy.
 */

/** Base error for all music-system errors */
export class MusicSystemError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly provider?: string,
    ) {
        super(message);
        this.name = 'MusicSystemError';
    }
}

/** Provider-specific error (timeout, auth, network) */
export class ProviderError extends MusicSystemError {
    constructor(
        message: string,
        provider: string,
        public readonly originalError?: Error,
    ) {
        super(message, `PROVIDER_${provider.toUpperCase().replace(/-/g, '_')}`, provider);
        this.name = 'ProviderError';
    }
}

/** Configuration error */
export class ConfigError extends MusicSystemError {
    constructor(message: string) {
        super(message, 'CONFIG_ERROR');
        this.name = 'ConfigError';
    }
}

/** Cache error */
export class CacheError extends MusicSystemError {
    constructor(message: string) {
        super(message, 'CACHE_ERROR');
        this.name = 'CacheError';
    }
}

/** Processing error (ffmpeg failure, corrupt file) */
export class ProcessingError extends MusicSystemError {
    constructor(
        message: string,
        public readonly stage: string,
    ) {
        super(message, `PROCESSING_${stage.toUpperCase()}`);
        this.name = 'ProcessingError';
    }
}

/** No matching music found (all providers returned empty) */
export class NoMusicFoundError extends MusicSystemError {
    constructor() {
        super('No music found from any provider', 'NO_MUSIC_FOUND');
        this.name = 'NoMusicFoundError';
    }
}
