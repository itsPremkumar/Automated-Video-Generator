/**
 * ai/types.ts — shared types for the local AI generation suite.
 *
 * Every AI module follows the same identity-preserving pattern:
 *   - isXEnabled() -> boolean (false when offline / no model / no hardware)
 *   - generateX(opts) -> Promise<string> (returns '' on any failure, never throws)
 *   - Provider chain: local -> fallback -> placeholder
 */

export type Orientation = 'portrait' | 'landscape' | 'square';

export type AiJobKind =
    | 'image-gen'
    | 'video-gen'
    | 'image-to-video'
    | 'upscale'
    | 'bg-removal'
    | 'beat-detect'
    | 'clip-embed'
    | 'script-enhance'
    | 'translate'
    | 'storyboard';

export interface AiJobResult {
    ok: boolean;
    outputPath: string;
    provider: string;
    durationMs: number;
    error?: string;
}

export interface AiQueueStatus {
    queueLength: number;
    currentJob: string | null;
    completedCount: number;
    failedCount: number;
}
