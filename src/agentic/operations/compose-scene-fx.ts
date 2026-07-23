/**
 * compose-scene-fx.ts — Per-scene inline-tag effects for the ffmpeg compose path.
 *
 * WHY THIS EXISTS
 * ----------------
 * The compose path (compose.ts) historically consumed ONLY job-level fields.
 * Inline script tags — [Grade:], [KenBurns:], [Vignette:] — are parsed into
 * `ScenePlan` objects by script-parser.ts → plan.ts, but were then dropped on
 * the compose path (they only reached the Remotion renderer). This module is
 * the missing bridge: it converts a scene's inline tags into real ffmpeg
 * filters and a real probed duration, so a tag-rich script renders the way the
 * JSON/script says it should.
 *
 * Everything here is PURE (filter-string builders) except `probeDurationSec`
 * and `applySceneGradeVignette`, which shell out to ffprobe/ffmpeg-static.
 * All effects are OPTIONAL — a scene with no tags returns its input unchanged,
 * preserving the previous behaviour exactly (backward-compatible by design).
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import type { ScenePlan } from '../types.js';

// ffprobe-static ships no type declarations; load it via require with a local
// shape so we stay dependency-free (no @types package needed).
function ffprobeStaticPath(): string | undefined {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('ffprobe-static') as { path?: string };
        return mod?.path;
    } catch {
        return undefined;
    }
}

function ffmpegBin(): string {
    const p = ffmpegPath as unknown as string;
    if (!p || !fs.existsSync(p)) throw new Error('ffmpeg-static binary not found');
    return p;
}

function ffprobeBin(): string | undefined {
    const p = ffprobeStaticPath();
    return p && fs.existsSync(p) ? p : undefined;
}

/** Default per-scene hold when no voiceover length is available. */
export const DEFAULT_SCENE_SEC = 3;

/**
 * Probe a media file's duration in seconds via ffprobe-static.
 * Returns `fallback` (default 3s) when the file is missing or ffprobe fails —
 * this is exactly the old hardcoded behaviour, so callers degrade gracefully.
 */
export function probeDurationSec(file: string | undefined, fallback = DEFAULT_SCENE_SEC): number {
    if (!file || !fs.existsSync(file)) return fallback;
    const bin = ffprobeBin();
    if (!bin) return fallback;
    try {
        const out = execFileSync(bin, [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            file,
        ], { timeout: 20000 }).toString().trim();
        const d = parseFloat(out);
        return Number.isFinite(d) && d > 0 ? d : fallback;
    } catch {
        return fallback;
    }
}

/**
 * Resolve per-scene durations from the voiceover audio (real length) with a
 * graceful fallback chain: probed audio → scene.durationSec → DEFAULT_SCENE_SEC.
 * `audios` and `scenes` are indexed identically to `visuals`.
 */
export function resolveSceneDurations(audios: string[], scenes?: ScenePlan[]): number[] {
    return audios.map((a, i) => {
        const probed = probeDurationSec(a, NaN);
        if (Number.isFinite(probed) && probed > 0) return probed;
        const planned = scenes?.[i]?.durationSec;
        return planned && planned > 0 ? planned : DEFAULT_SCENE_SEC;
    });
}

/** Map an inline [Grade: ...] value to a real ffmpeg color filter. */
export function gradeFilter(grade: string | undefined): string | undefined {
    switch ((grade ?? '').toLowerCase()) {
        case 'warm':
            return 'eq=gamma_r=1.12:gamma_b=0.90:saturation=1.10';
        case 'cool':
            return 'eq=gamma_b=1.12:gamma_r=0.92:saturation=1.05';
        case 'cinematic':
            return 'curves=preset=strong_contrast,eq=saturation=0.92';
        case 'vivid':
            return 'eq=saturation=1.40:contrast=1.10';
        case 'neutral':
            return undefined; // explicit no-op
        default:
            return undefined;
    }
}

/** Vignette filter string. */
export function vignetteFilter(): string {
    return 'vignette=PI/4';
}

/**
 * Apply a scene's inline [Grade:] and [Vignette:] tags (plus a job-level
 * vignette fallback) to a clip. Returns a NEW path when a filter was applied,
 * otherwise the input path unchanged (no-op is free).
 */
export function applySceneGradeVignette(
    clipPath: string,
    sceneIndex: number,
    scene: ScenePlan | undefined,
    jobVignette: boolean | undefined,
    workDir: string,
): string {
    if (!scene || !fs.existsSync(clipPath)) return clipPath;
    const filters: string[] = [];
    const g = gradeFilter(scene.grade);
    if (g) filters.push(g);
    const wantVignette = scene.vignette ?? jobVignette;
    if (wantVignette) filters.push(vignetteFilter());
    if (filters.length === 0) return clipPath;

    const out = path.join(workDir, `grade_${sceneIndex}.mp4`);
    try {
        execFileSync(ffmpegBin(), [
            '-y', '-i', clipPath, '-vf', filters.join(','),
            '-an', '-c:v', 'libx264', '-preset', 'veryfast', out,
        ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 90000 });
        return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : clipPath;
    } catch (e: any) {
        console.warn(`  ⚠ grade/vignette scene ${sceneIndex} failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
        return clipPath;
    }
}
