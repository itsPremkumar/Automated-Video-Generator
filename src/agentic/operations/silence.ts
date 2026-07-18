/**
 * silence.ts — REMOVE SILENCE / DEAD AIR from a video or audio file (single task).
 *
 * Zero-cost ffmpeg only (silencedetect + filter_complex). Scans the audio
 * track for spans quieter than `noise` dB for longer than `minDur` seconds,
 * drops the silent spans, and concatenates the spoken spans back together.
 * Great for trimming "um", dead air, and long pauses out of talking-head
 * footage without any paid transcription/API.
 *
 * The ffmpeg runner is INJECTABLE (default: bundled runFfmpeg) so the logic
 * can be unit-tested with a fake/mock runner (no real GPU / no real binary).
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';
import { probeMedia, type ProbeRunner } from './probe.js';

/** A span in seconds: [start, end]. */
export interface Span { start: number; end: number; }

export interface SilenceResult {
    ok: boolean;
    output?: string;
    detail: string;
    /** spoken spans kept, in seconds */
    spoken?: Span[];
    /** silent spans removed, in seconds */
    removed?: Span[];
    /** duration before / after, seconds */
    durationIn?: number;
    durationOut?: number;
}

/** Parse ffmpeg silencedetect stderr into silence spans (seconds). */
export function parseSilenceLog(log: string, duration: number, minDur: number): Span[] {
    const starts: number[] = [];
    const ends: number[] = [];
    const durRe = /silence_duration:\s*([\d.]+)/g;
    const startRe = /silence_start:\s*([\d.]+)/g;
    const endRe = /silence_end:\s*([\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = startRe.exec(log))) starts.push(parseFloat(m[1]));
    while ((m = endRe.exec(log))) ends.push(parseFloat(m[1]));
    while ((m = durRe.exec(log))) { /* duration marker, ignored for span build */ }

    const spans: Span[] = [];
    for (let i = 0; i < starts.length; i++) {
        const s = starts[i];
        const e = ends[i] ?? duration;
        if (e - s >= minDur) spans.push({ start: s, end: e });
    }
    // Merge overlaps (silencedetect can emit overlapping windows)
    spans.sort((a, b) => a.start - b.start);
    const merged: Span[] = [];
    for (const sp of spans) {
        const last = merged[merged.length - 1];
        if (last && sp.start <= last.end + 1e-3) last.end = Math.max(last.end, sp.end);
        else merged.push({ ...sp });
    }
    return merged;
}

/** Invert silence spans into the spoken (keep) spans. */
export function spokenSpans(silence: Span[], duration: number): Span[] {
    const spoken: Span[] = [];
    let cursor = 0;
    for (const s of silence) {
        if (s.start > cursor) spoken.push({ start: cursor, end: s.start });
        cursor = Math.max(cursor, s.end);
    }
    if (cursor < duration) spoken.push({ start: cursor, end: duration });
    return spoken;
}

/** Build a select/aselect+concat filter that keeps only spoken spans. */
export function buildKeepFilter(spoken: Span[]): string {
    if (spoken.length === 0) return '';
    const vcond = spoken.map((s) => `between(t,${s.start},${s.end})`).join('+');
    const acond = spoken.map((s) => `between(t,${s.start},${s.end})`).join('+');
    return `select='${vcond}',setpts=N/FRAME_RATE/TB[vs];aselect='${acond}',asetpts=N/SR/TB[as]`;
}

export interface SilenceOpts {
    /** silence threshold in dB (more negative = quieter counted as silence). */
    noise?: number;
    /** minimum silence length to cut, seconds. */
    minDur?: number;
    /** optional injected runner (mock for tests). */
    runner?: (args: string[]) => Promise<{ code: number; out: string }>;
    /** optional injected probe (mock for tests). */
    probe?: ProbeRunner;
}

/**
 * Remove silence from a video/audio file.
 * @param file   input media
 * @param out    optional output path
 * @param opts   noise (dB), minDur (s), runner (injectable for tests)
 */
export async function removeSilence(
    file: string,
    out?: string,
    opts: SilenceOpts = {},
): Promise<SilenceResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const noise = opts.noise ?? -35;
    const minDur = opts.minDur ?? 0.5;
    const runner = opts.runner ?? runFfmpeg;
    const output = out ?? path.join(process.cwd(), 'output', `nosilence_${Date.now()}.${path.extname(file) || 'mp4'}`.replace(/^\./, ''));
    fs.mkdirSync(path.dirname(output), { recursive: true });

    // Step 1: detect silence.
    const det = await runner(['-i', file, '-af', `silencedetect=n=${noise}:d=${minDur}`, '-f', 'null', '-']);
    if (det.code !== 0) return { ok: false, detail: `silence detect failed:\n${det.out.slice(-600)}` };

    // Step 2: probe REAL duration with ffprobe (injected for tests).
    const probe = opts.probe ?? probeMedia;
    const info = await probe(file);
    const duration = info.duration > 0 ? info.duration : parseDurationHint(det.out);
    if (!duration) return { ok: false, detail: 'could not determine media duration' };

    const silence = parseSilenceLog(det.out, duration, minDur);
    const spoken = spokenSpans(silence, duration);

    if (spoken.length === 0) {
        // No speech found: pass through.
        const pass = await runner(['-i', file, '-c', 'copy', '-y', output]);
        return { ok: pass.code === 0, output: pass.code === 0 ? output : undefined, detail: 'no speech detected; passed through', spoken: [], removed: silence };
    }

    const vf = buildKeepFilter(spoken);
    if (!vf) return { ok: false, detail: 'could not build keep filter' };

    const { code, out: log } = await runner([
        '-i', file,
        '-filter_complex', `[0:v]${vf}[v];[0:a]${vf}[a]`,
        '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', output,
    ]);
    if (code !== 0) return { ok: false, detail: `silence-remove failed:\n${log.slice(-600)}` };
    // When a mock runner is injected it may not materialise the file; only
    // enforce existence for the real bundled runner.
    if (!opts.runner && !fs.existsSync(output)) return { ok: false, detail: 'output not produced' };

    const durOut = spoken.reduce((acc, s) => acc + (s.end - s.start), 0);
    return {
        ok: true,
        output,
        detail: `removed ${silence.length} silent span(s), kept ${spoken.length} spoken span(s)`,
        spoken,
        removed: silence,
        durationIn: duration || undefined,
        durationOut: durOut,
    };
}

/** Some runners (tests) embed "DURATION:12.5" in their output so we know length. */
function parseDurationHint(log: string): number | null {
    const m = log.match(/DURATION:([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
}
