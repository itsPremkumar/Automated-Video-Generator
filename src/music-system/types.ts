/**
 * src/music-system/types.ts
 * Core type system for the reusable music module — all interfaces, enums, and type aliases.
 * Zero external dependencies. Importable by ANY system in the project.
 */

// ─── Enums / Constants ────────────────────────────────────────────

/** What role this music plays in the final video */
export type MusicRole = 'background' | 'intro' | 'outro' | 'transition' | 'stinger';

/** Primary mood category for music selection */
export type MusicMood =
    | 'calm'
    | 'upbeat'
    | 'dramatic'
    | 'professional'
    | 'nostalgic'
    | 'dark'
    | 'any';

/** Intensity level */
export type MusicIntensity = 'low' | 'mid' | 'high';

/** Source of a provider's data */
export type ProviderNetworkRequirement = 'online' | 'offline';

// ─── Core Data Types ──────────────────────────────────────────────

/** A single music track — immutable metadata about a piece of music. */
export interface MusicTrack {
    /** Unique identifier within this provider */
    id: string;
    /** Human-readable title */
    title: string;
    /** Artist / creator name */
    creator: string;
    /** License string (e.g. 'CC0 1.0 Universal') */
    license: string;
    /** URL to the full license text */
    licenseUrl: string;
    /** Provider name (matches MusicProvider.name) */
    provider: string;
    /** URL to download or '__ffmpeg_generated__' for procedural */
    downloadUrl: string;
    /** Genre tag (e.g. 'ambient', 'lofi', 'cinematic') */
    genre: string;
    /** File format extension (e.g. 'mp3', 'wav', 'ogg') */
    format: string;
    /** Searchable tags */
    tags: string[];
    /** Known duration in seconds (0 if unknown at query time) */
    durationSec: number;
    /** Optional BPM for beat-matching */
    bpm?: number;
    /** Optional mood tags from source metadata */
    mood?: string[];
    /** Optional waveform preview URL (Pixabay provides this) */
    waveformUrl?: string;
}

/** What we want — the query describing desired music. */
export interface MusicQuery {
    /** Primary mood */
    mood: MusicMood;
    /** User-facing topic (for keyword extraction) */
    topic?: string;
    /** Voiceover text (for context-aware matching) */
    voiceoverText?: string;
    /** Target duration in seconds (how long the music needs to play) */
    targetDurationSec: number;
    /** Minimum acceptable duration in seconds */
    minDurationSec: number;
    /** Desired intensity */
    intensity?: MusicIntensity;
    /** Preferred genres in order */
    preferredGenres?: string[];
    /** Genres to exclude */
    excludedGenres?: string[];
    /** How this music will be used */
    role: MusicRole;
}

/** Result of resolving music — a local file + metadata. */
export interface ResolvedMusic {
    /** Absolute path to the downloaded/generated audio file */
    localPath: string;
    /** Source track metadata */
    track: MusicTrack;
    /** How this music is used */
    role: MusicRole;
    /** What processing was applied */
    processing: ProcessingResult;
    /** Provider latency in milliseconds */
    latencyMs: number;
}

/** Record of processing steps applied to a raw track. */
export interface ProcessingResult {
    trimmed: boolean;
    faded: boolean;
    normalized: boolean;
    looped: boolean;
    /** Duration of original file before processing */
    originalDurationSec: number;
    /** Duration of final processed file */
    finalDurationSec: number;
}

// ─── Provider Interface ───────────────────────────────────────────

/** Every music provider implements this interface. */
export interface MusicProvider {
    /** Unique identifier (lowercase, hyphens) */
    readonly name: string;
    /** Human-readable label */
    readonly label: string;
    /** Priority (1 = highest). Lower number = tried first. */
    readonly priority: number;
    /** Whether this provider requires network access */
    readonly requiresNetwork: boolean;

    /**
     * Search for tracks matching the query.
     * Returns empty array if no matches (never throws for "no results").
     * Throws only on genuine errors (timeout, auth failure, corrupt response).
     */
    search(query: MusicQuery): Promise<MusicTrack[]>;

    /**
     * Download a specific track to a local path.
     * Must create parent directories.
     * Returns the absolute path to the downloaded file.
     */
    download(track: MusicTrack, destPath: string): Promise<string>;
}

// ─── Configuration ────────────────────────────────────────────────

export interface ProcessingOptions {
    /** Whether to trim to target duration */
    trimToDuration: boolean;
    /** Whether to apply intro/outro fade */
    applyFade: boolean;
    /** Fade-in duration in seconds */
    fadeInSec: number;
    /** Fade-out duration in seconds */
    fadeOutSec: number;
    /** Whether to normalize loudness */
    normalizeLoudness: boolean;
    /** Target LUFS level (e.g. -23) */
    targetLufs: number;
    /** Whether to loop short tracks to fill target duration */
    enableLooping: boolean;
}

export const DEFAULT_PROCESSING: ProcessingOptions = {
    trimToDuration: true,
    applyFade: true,
    fadeInSec: 2,
    fadeOutSec: 2,
    normalizeLoudness: true,
    targetLufs: -23,
    enableLooping: true,
};

export interface ProviderOverrides {
    pixabay?: {
        apiKey?: string;
        maxResults?: number;
    };
    'internet-archive'?: {
        requestDelayMs?: number;
        maxResults?: number;
    };
    procedural?: {
        /** Auto-detect from mood by default */
        profile?: 'ambient' | 'upbeat' | 'cinematic';
    };
    [key: string]: unknown;
}

export interface MusicEngineConfig {
    /** Enable/disable entirely */
    enabled: boolean;
    /** Cache directory */
    cacheDir: string;
    /** Provider timeout in ms */
    providerTimeout: number;
    /** Whether to search all providers in parallel */
    parallelSearch: boolean;
    /** Processing options */
    processing: ProcessingOptions;
    /** Provider-specific overrides */
    providers: ProviderOverrides;
}

export const DEFAULT_CONFIG: MusicEngineConfig = {
    enabled: true,
    cacheDir: '', // resolved at runtime relative to project root
    providerTimeout: 10_000,
    parallelSearch: true,
    processing: { ...DEFAULT_PROCESSING },
    providers: {},
};

// ─── Events ───────────────────────────────────────────────────────

export type MusicEventType =
    | 'provider:search:start'
    | 'provider:search:success'
    | 'provider:search:fail'
    | 'track:selected'
    | 'track:downloading'
    | 'track:downloaded'
    | 'track:processing'
    | 'track:processed'
    | 'track:cached'
    | 'engine:fallback'
    | 'engine:complete'
    | 'engine:error';

export interface MusicEvent {
    type: MusicEventType;
    timestamp: number;
    provider?: string;
    track?: MusicTrack;
    error?: string;
    latencyMs?: number;
}

/** Callback signature for event subscribers */
export type MusicEventCallback = (event: MusicEvent) => void;

// ─── Utility Types ────────────────────────────────────────────────

/** Describes a processing stage's input/output */
export interface ProcessingStageInput {
    inputPath: string;
    outputPath: string;
    targetDurationSec: number;
    role: MusicRole;
}

/** Result of a single processing stage */
export interface StageResult {
    outputPath: string;
    success: boolean;
    error?: string;
    metadata?: Record<string, number | string>;
}
