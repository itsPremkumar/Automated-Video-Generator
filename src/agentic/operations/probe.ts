/**
 * probe.ts — REAL media probing via the bundled ffprobe binary.
 *
 * Why this exists: the original single-task ops derived media duration /
 * dimensions from ad-hoc hints in ffmpeg stderr (e.g. a "DURATION:n" sentinel
 * that real ffmpeg output does NOT emit). In production that made
 * silence-removal a no-op (duration fell back to 1e9) and scene trim/chapters
 * return empty (duration fell back to 0). This module probes the truth with
 * ffprobe and is INJECTABLE so the logic is unit-testable without the binary.
 */

// ffprobe-static ships without type declarations.
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';

export interface MediaInfo {
    /** total duration in seconds */
    duration: number;
    /** pixel width (0 if unknown / audio-only) */
    width: number;
    /** pixel height (0 if unknown / audio-only) */
    height: number;
}

/** Default probe runner: shells out to the bundled ffprobe binary. */
export type ProbeRunner = (file: string) => Promise<MediaInfo>;

const defaultRunner: ProbeRunner = (file: string) =>
    new Promise((resolve) => {
        const { spawn } = require('child_process') as typeof import('child_process');
        const bin = (ffprobeStatic as unknown as { path: string }).path;
        const child = spawn(
            bin,
            [
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-show_entries',
                'stream=width,height',
                '-of',
                'json',
                file,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let out = '';
        child.stdout.on('data', (d) => (out += d.toString()));
        child.stderr.on('data', (d) => (out += d.toString()));
        child.on('close', (code) => resolve(code === 0 ? parseProbe(out) : { duration: 0, width: 0, height: 0 }));
    });

/**
 * Parse ffprobe JSON output into MediaInfo.
 * Pure → unit-testable.
 */
export function parseProbe(out: string): MediaInfo {
    let data: any = null;
    try {
        data = JSON.parse(out);
    } catch {
        return { duration: 0, width: 0, height: 0 };
    }
    const dur = parseFloat(data?.format?.duration ?? '0') || 0;
    let width = 0,
        height = 0;
    for (const s of data?.streams ?? []) {
        if (s.width && s.height && (s.codec_type === 'video' || !width)) {
            width = parseInt(s.width, 10) || width;
            height = parseInt(s.height, 10) || height;
        }
    }
    return { duration: dur, width, height };
}

/**
 * Probe a media file. Uses the injected runner when provided (tests), else the
 * real bundled ffprobe.
 */
export async function probeMedia(file: string, runner: ProbeRunner = defaultRunner): Promise<MediaInfo> {
    return runner(file);
}
