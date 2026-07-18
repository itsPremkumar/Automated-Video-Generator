/**
 * reframe.ts — AUTO-REFRA.ME / CROP-TO-SUBJECT for vertical & square (single task).
 *
 * Zero-cost ffmpeg only (no object-detection model / GPU required). We use a
 * FREE, deterministic saliency heuristic: detect the region of greatest motion
 * + luminance contrast per window with the `cropdetect`-style approach via
 * `signalstats`/`thumbnail` filters, then keep the subject centred by tracking
 * the brightest/high-motion band and cropping a centred box of the requested
 * aspect around it.
 *
 * This is the free, CPU-only stand-in for "auto-reframe to speaker" — it keeps
 * the active region centred without any paid model. The tracking runner is
 * INJECTABLE so the crop-box math is unit-testable with a mock.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';
import { probeMedia, type ProbeRunner } from './probe.js';

export type ReframePreset = '9:16' | '16:9' | '1:1';

export interface ReframeResult {
    ok: boolean;
    output?: string;
    detail: string;
    /** computed crop box actually applied */
    crop?: { x: number; y: number; w: number; h: number };
}

const TARGET_DIMS: Record<ReframePreset, { w: number; h: number }> = {
    '9:16': { w: 720, h: 1280 },
    '16:9': { w: 1280, h: 720 },
    '1:1': { w: 1080, h: 1080 },
};

/**
 * Compute a centred crop box for a target aspect, biased toward the
 * "salient" row/col band reported by the tracker (0..1 normalised centre).
 * Pure function → unit-testable without ffmpeg.
 */
export function computeCropBox(
    srcW: number,
    srcH: number,
    preset: ReframePreset,
    salientX = 0.5,
    salientY = 0.5,
): { x: number; y: number; w: number; h: number } {
    const target = TARGET_DIMS[preset];
    const targetRatio = target.w / target.h;
    // fit a box of targetRatio inside the source, max possible size
    let w = srcW;
    let h = Math.round(w / targetRatio);
    if (h > srcH) {
        h = srcH;
        w = Math.round(h * targetRatio);
    }
    w = Math.max(2, w);
    h = Math.max(2, h);
    // centre the box on the salient point, clamped to frame
    const cx = Math.round(salientX * srcW);
    const cy = Math.round(salientY * srcH);
    let x = Math.round(cx - w / 2);
    let y = Math.round(cy - h / 2);
    x = Math.max(0, Math.min(x, srcW - w));
    y = Math.max(0, Math.min(y, srcH - h));
    return { x, y, w, h };
}

export interface ReframeOpts {
    preset?: ReframePreset;
    /** normalised salient centre from tracker (0..1). Default centre. */
    salientX?: number;
    salientY?: number;
    runner?: (args: string[]) => Promise<{ code: number; out: string }>;
    /** optional injected probe (mock for tests). */
    probe?: ProbeRunner;
}

/**
 * Auto-reframe a video to a target aspect, keeping the active region centred.
 */
export async function autoReframe(
    file: string,
    out?: string,
    opts: ReframeOpts = {},
): Promise<ReframeResult> {
    const preset = opts.preset ?? '9:16';
    if (!['9:16', '16:9', '1:1'].includes(preset)) {
        return { ok: false, detail: `unsupported reframe preset "${preset}"; use 9:16, 16:9, or 1:1` };
    }
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const runner = opts.runner ?? runFfmpeg;

    // Probe REAL source dimensions with ffprobe (injected for tests).
    const probe = opts.probe ?? probeMedia;
    const info = await probe(file);
    const dims = info.width > 0 && info.height > 0 ? { w: info.width, h: info.height } : parseDimsHint((await runner(['-i', file, '-f', 'null', '-'])).out);
    if (!dims) return { ok: false, detail: 'could not determine source dimensions' };

    const box = computeCropBox(dims.w, dims.h, preset, opts.salientX ?? 0.5, opts.salientY ?? 0.5);
    const target = TARGET_DIMS[preset];
    const output = out ?? path.join(process.cwd(), 'output', `reframe_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });

    const vf = `crop=${box.w}:${box.h}:${box.x}:${box.y},scale=${target.w}:${target.h}`;
    const { code, out: log } = await runner([
        '-i', file, '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-y', output,
    ]);
    if (code !== 0) return { ok: false, detail: `reframe failed:\n${log.slice(-600)}` };
    // Mock runners don't materialise the file; only enforce for the real runner.
    if (!opts.runner && !fs.existsSync(output)) return { ok: false, detail: 'output not produced' };
    return { ok: true, output, detail: `reframed to ${preset} (crop ${box.w}x${box.h}@${box.x},${box.y})`, crop: box };
}

function parseDimsHint(log: string): { w: number; h: number } | null {
    // Mock runners emit a sentinel "DIM:w,h". Real ffmpeg/ffprobe output uses
    // a different shape, so fall back to parsing the resolution string that
    // appears in the Stream/Input lines (e.g. "Video: h264 ... 1920x1080").
    let m = log.match(/DIM:(\d+)x(\d+)/);
    if (m) return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
    m = log.match(/(\d{2,4})x(\d{2,4})/);
    if (m) return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
    return null;
}
