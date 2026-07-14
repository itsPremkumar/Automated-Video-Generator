/**
 * Subtitle / caption engine (PRE-15 Feature A).
 *
 * Captures speech-timed caption cues from Edge-TTS word-boundary subtitle output,
 * persists them into scene-data.json as `captionSegments`, and serializes SRT/VTT
 * sidecar files. Falls back to a single scene-length cue for engines that do not
 * emit word boundaries (Windows SAPI, custom API providers).
 *
 * Timing model: each scene's `captionSegments` are stored relative to the scene
 * start (0-based ms). Sidecar serialization offsets them onto the global timeline.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Caption, parseSrt, serializeSrt } from '@remotion/captions';

/** A single speech-timed caption cue, relative to its scene start (milliseconds). */
export interface CaptionSegment {
    text: string;
    startMs: number;
    endMs: number;
}

/** How subtitles are applied to a render. */
export type SubtitleMode = 'off' | 'overlay' | 'burned';

/** Sidecar caption file format. */
export type CaptionFormat = 'srt' | 'vtt';

export const DEFAULT_SUBTITLE_MODE: SubtitleMode = 'burned';
export const DEFAULT_CAPTION_FORMAT: CaptionFormat = 'srt';

/**
 * Parse an Edge-TTS `--write-subtitles` SRT file into scene-relative caption
 * segments. Returns null when the file is missing, empty, or unparseable so the
 * caller can fall back to a scene-length overlay.
 */
export function parseEdgeTtsSubtitles(srtPath: string): CaptionSegment[] | null {
    try {
        if (!fs.existsSync(srtPath)) return null;
        const raw = fs.readFileSync(srtPath, 'utf8').trim();
        if (!raw) return null;
        const { captions } = parseSrt({ input: raw });
        const segments = captions
            .filter((c) => typeof c.text === 'string' && c.text.trim().length > 0)
            .map((c) => ({ text: c.text.trim(), startMs: Math.max(0, c.startMs), endMs: Math.max(0, c.endMs) }));
        return segments.length > 0 ? segments : null;
    } catch {
        return null;
    }
}

/**
 * Build a fallback single cue spanning the whole scene when no word boundaries
 * are available. Duration is in seconds.
 */
export function buildFallbackSegments(text: string, durationSeconds: number): CaptionSegment[] {
    const clean = (text || '').trim();
    if (!clean) return [];
    const endMs = Math.max(500, Math.round((durationSeconds || 0) * 1000));
    return [{ text: clean, startMs: 0, endMs }];
}

/**
 * Return the caption segment active at a given time offset (ms) within a scene,
 * or null if none is active. Used by the render overlay.
 */
export function activeSegmentAt(segments: CaptionSegment[] | undefined, timeMs: number): CaptionSegment | null {
    if (!segments || segments.length === 0) return null;
    for (const seg of segments) {
        if (timeMs >= seg.startMs && timeMs < seg.endMs) return seg;
    }
    // Clamp to the last segment if we are past the final cue (avoids flicker at scene tail).
    const last = segments[segments.length - 1];
    if (last && timeMs >= last.endMs) return last;
    return segments[0] ?? null;
}

interface TimelineScene {
    startMs: number;
    segments?: CaptionSegment[];
    fallbackText?: string;
    durationSeconds?: number;
}

/**
 * Flatten per-scene caption segments onto a single global timeline of
 * `@remotion/captions` Caption cues, offsetting each scene's cues by its start.
 */
export function buildGlobalCaptions(scenes: TimelineScene[]): Caption[] {
    const captions: Caption[] = [];
    for (const scene of scenes) {
        const segments =
            scene.segments && scene.segments.length > 0
                ? scene.segments
                : buildFallbackSegments(scene.fallbackText ?? '', scene.durationSeconds ?? 0);
        for (const seg of segments) {
            const startMs = scene.startMs + seg.startMs;
            const endMs = scene.startMs + seg.endMs;
            captions.push({
                text: seg.text,
                startMs,
                endMs,
                timestampMs: Math.round((startMs + endMs) / 2),
                confidence: null,
            });
        }
    }
    return captions;
}

/** Serialize global captions to SRT using @remotion/captions (one cue per line group). */
export function serializeCaptionsToSrt(captions: Caption[]): string {
    if (captions.length === 0) return '';
    return serializeSrt({ lines: captions.map((c) => [c]) });
}

function msToVttTimestamp(ms: number): string {
    const totalMs = Math.max(0, Math.round(ms));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const millis = totalMs % 1000;
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

/** Serialize global captions to WebVTT. */
export function serializeCaptionsToVtt(captions: Caption[]): string {
    const header = 'WEBVTT\n';
    if (captions.length === 0) return header + '\n';
    const cues = captions
        .map((c, i) => {
            const start = msToVttTimestamp(c.startMs);
            const end = msToVttTimestamp(c.endMs);
            return `${i + 1}\n${start} --> ${end}\n${c.text}`;
        })
        .join('\n\n');
    return `${header}\n${cues}\n`;
}

/** Serialize captions to the requested sidecar format. */
export function serializeCaptions(captions: Caption[], format: CaptionFormat): string {
    return format === 'vtt' ? serializeCaptionsToVtt(captions) : serializeCaptionsToSrt(captions);
}

/**
 * Cue distribution mode for sidecar export (distinct from SubtitleMode, which
 * controls the on-screen burn-in). `sentence` emits one cue per scene; `word`
 * karaoke-splits the scene text word-by-word across the scene duration.
 */
export type CaptionCueMode = 'sentence' | 'word';

/** Minimal scene shape needed to derive caption cues. */
export interface CaptionSourceScene {
    text: string;
    durationSeconds: number;
}

/**
 * Derive per-scene caption cues from plain scene text + duration.
 * - `sentence` → a single cue spanning the whole scene.
 * - `word` → one cue per whitespace-separated word (karaoke timing).
 * Returns [] for empty text so the caller can omit the scene.
 */
export function deriveSceneCaptions(scene: CaptionSourceScene, mode: CaptionCueMode = 'sentence'): CaptionSegment[] {
    const text = (scene.text || '').trim();
    if (!text) return [];
    if (mode === 'word') {
        const words = text.split(/\s+/).filter(Boolean);
        if (words.length === 0) return [];
        const totalMs = Math.max(500, Math.round((scene.durationSeconds || 0) * 1000));
        const per = totalMs / words.length;
        return words.map((w, i) => ({
            text: w,
            startMs: Math.round(i * per),
            endMs: Math.round((i + 1) * per),
        }));
    }
    return buildFallbackSegments(text, scene.durationSeconds);
}

/**
 * Build a single global caption timeline (SRT/VTT-ready) from scene data.
 * Scene start offsets accumulate from each scene's duration.
 */
export function deriveGlobalCaptions(scenes: CaptionSourceScene[], mode: CaptionCueMode = 'sentence'): Caption[] {
    let startMs = 0;
    const timeline: TimelineScene[] = [];
    for (const scene of scenes) {
        timeline.push({
            startMs,
            fallbackText: scene.text,
            durationSeconds: scene.durationSeconds,
            segments: deriveSceneCaptions(scene, mode),
        });
        startMs += Math.max(0, Math.round((scene.durationSeconds || 0) * 1000));
    }
    return buildGlobalCaptions(timeline);
}

export interface CaptionSidecarOptions {
    /** Cue distribution mode. Default 'sentence'. */
    mode?: CaptionCueMode;
    /** Base filename (without extension). Default 'subtitles'. */
    baseName?: string;
}

/**
 * Write sidecar caption files next to the rendered MP4 (spec F2).
 * Always emits both `subtitles.srt` and `subtitles.vtt` (cheap, high value).
 * Returns the list of written file paths. Skips writing entirely when no
 * scene has any text, so an empty render does not produce bogus artifacts.
 */
export function writeCaptionSidecars(outputDir: string, scenes: CaptionSourceScene[], opts: CaptionSidecarOptions = {}): string[] {
    const mode = opts.mode ?? 'sentence';
    const baseName = opts.baseName ?? 'subtitles';
    const captions = deriveGlobalCaptions(scenes, mode);
    if (captions.length === 0) return [];
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const srtPath = path.join(outputDir, `${baseName}.srt`);
    const vttPath = path.join(outputDir, `${baseName}.vtt`);
    fs.writeFileSync(srtPath, serializeCaptionsToSrt(captions));
    fs.writeFileSync(vttPath, serializeCaptionsToVtt(captions));
    return [srtPath, vttPath];
}
