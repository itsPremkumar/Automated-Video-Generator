/**
 * edit.ts — reusable, standalone VIDEO-EDITING primitives.
 *
 * Each function is a SINGLE task a user can ask for in plain language
 * ("merge these two videos", "trim this clip", "crop to 9:16", ...).
 *
 * They are deliberately decoupled from the full agentic pipeline: the agent
 * (or any MCP client) calls ONE of these and gets ONE deliverable back.
 *
 * ZERO-COST: everything runs on the bundled ffmpeg-static binary. No API
 * keys, no paid services. Every function is async with a hard timeout so a
 * stalled ffmpeg child can never hang the agent loop.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

const ffmpeg: string = (() => {
    try {
        return require('ffmpeg-static');
    } catch {
        return 'ffmpeg';
    }
})();

/** Run ffmpeg with a hard wall-clock timeout. Resolves to stderr (ffmpeg logs there). */
export function runFfmpeg(args: string[], timeoutMs = 120000): Promise<{ code: number; out: string }> {
    return new Promise((resolve) => {
        const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        const t = setTimeout(() => {
            try {
                child.kill('SIGKILL');
            } catch {
                /* noop */
            }
            resolve({ code: -1, out });
        }, timeoutMs);
        child.stdout?.on('data', (d: Buffer) => {
            out += d.toString();
        });
        child.stderr?.on('data', (d: Buffer) => {
            out += d.toString();
        });
        child.on('error', () => {
            clearTimeout(t);
            resolve({ code: -1, out });
        });
        child.on('close', (code) => {
            clearTimeout(t);
            resolve({ code: code ?? -1, out });
        });
    });
}

/** Resolve an output path; create its parent dir; default extension if missing. */
function resolveOut(out?: string, defaultExt = 'mp4', baseName = 'output'): string {
    let p = out ?? path.join(process.cwd(), 'output', `${baseName}_${Date.now()}.${defaultExt}`);
    if (!path.extname(p)) p += `.${defaultExt}`;
    fs.mkdirSync(path.dirname(p), { recursive: true });
    return p;
}

export interface EditResult {
    ok: boolean;
    output: string;
    detail: string;
}

function ok(output: string, detail: string): EditResult {
    return { ok: true, output, detail };
}
function fail(detail: string): EditResult {
    return { ok: false, output: '', detail };
}

function ensureFiles(files: string[]): string | null {
    for (const f of files) {
        if (!fs.existsSync(f)) return `input not found: ${f}`;
    }
    if (files.length === 0) return 'no input files provided';
    return null;
}

/**
 * MERGE — concat N videos into one.
 * Re-encodes with a shared pixel format / resolution so clips of differing
 * sizes/codecs concatenate cleanly (the safe filter_complex concat).
 */
export async function mergeVideos(files: string[], out?: string, orientation: 'portrait' | 'landscape' = 'portrait'): Promise<EditResult> {
    const err = ensureFiles(files);
    if (err) return fail(err);
    const output = resolveOut(out, 'mp4', 'merged');
    const W = orientation === 'landscape' ? 1280 : 720;
    const H = orientation === 'landscape' ? 720 : 1280;
    const inputs = files.flatMap((f) => ['-i', f]);
    const labels = files.map((_, i) => `[${i}:v]`).join('');
    const filter = files
        .map((_, i) => `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`)
        .join(';');
    const concat = files.map((_, i) => `[v${i}]`).join('') + `concat=n=${files.length}:v=1:a=0[outv]`;
    const { code, out: log } = await runFfmpeg([
        ...inputs,
        '-filter_complex',
        `${filter};${concat}`,
        '-map',
        '[outv]',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        output,
    ]);
    if (code !== 0) return fail(`ffmpeg merge failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(output)) return fail('merge produced no output file');
    return ok(output, `merged ${files.length} clips -> ${output}`);
}

/**
 * TRIM — cut [start, end] seconds out of one video.
 */
export async function trimVideo(file: string, out?: string, startSec = 0, endSec?: number): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    const output = resolveOut(out, 'mp4', 'trimmed');
    // Seek AFTER -i (accurate seek) so output is never empty even on streams
    // that copy-seek can't keyframe-align. Re-encode lightly for safety.
    const args = ['-i', file, '-ss', String(startSec)];
    if (endSec != null) args.push('-to', String(endSec));
    args.push('-c', 'copy', '-y', output);
    const { code, out: log } = await runFfmpeg(args);
    if (code !== 0) return fail(`ffmpeg trim failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(output)) return fail('trim produced no output file');
    return ok(output, `trimmed ${file} [${startSec}s${endSec != null ? `–${endSec}s` : ''}] -> ${output}`);
}

export interface CropOptions {
    /** explicit pixel box */
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    /** OR a preset aspect to crop INTO (width x height of the target frame) */
    preset?: '9:16' | '16:9' | '1:1';
}

const PRESET_DIMS: Record<string, { w: number; h: number }> = {
    '9:16': { w: 720, h: 1280 },
    '16:9': { w: 1280, h: 720 },
    '1:1': { w: 1080, h: 1080 },
};

/**
 * CROP — crop to an explicit box OR to a target aspect preset.
 * When preset is given we scale to the preset resolution (safe, never upscales
 * weirdly) and pad to center.
 */
export async function cropVideo(file: string, out?: string, opts: CropOptions = {}): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    const output = resolveOut(out, 'mp4', 'cropped');
    let vf: string;
    if (opts.preset && PRESET_DIMS[opts.preset]) {
        const { w, h } = PRESET_DIMS[opts.preset];
        vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
    } else if (opts.w && opts.h) {
        const x = opts.x ?? 0;
        const y = opts.y ?? 0;
        vf = `crop=${opts.w}:${opts.h}:${x}:${y}`;
    } else {
        return fail('crop needs either preset or {w,h} (and optional x,y)');
    }
    const { code, out: log } = await runFfmpeg([
        '-i',
        file,
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        output,
    ]);
    if (code !== 0) return fail(`ffmpeg crop failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(output)) return fail('crop produced no output file');
    return ok(output, `cropped ${file} (${opts.preset ?? `${opts.w}x${opts.h}`}) -> ${output}`);
}

/** RESIZE — scale to explicit WxH (or just width, height auto by -2). */
export async function resizeVideo(file: string, out?: string, w = 720, h = -2): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    const output = resolveOut(out, 'mp4', 'resized');
    const { code, out: log } = await runFfmpeg([
        '-i',
        file,
        '-vf',
        `scale=${w}:${h}`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        output,
    ]);
    if (code !== 0) return fail(`ffmpeg resize failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(output)) return fail('resize produced no output file');
    return ok(output, `resized ${file} -> ${w}x${h} -> ${output}`);
}

/** ROTATE — 90/180/270 degrees (or transpose shorthand). */
export async function rotateVideo(file: string, out?: string, deg: 90 | 180 | 270 = 90): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    const output = resolveOut(out, 'mp4', 'rotated');
    const transpose =
        deg === 90 ? 'transpose=1' : deg === 270 ? 'transpose=2' : 'transpose=1,transpose=1';
    const { code, out: log } = await runFfmpeg([
        '-i',
        file,
        '-vf',
        transpose,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        output,
    ]);
    if (code !== 0) return fail(`ffmpeg rotate failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(output)) return fail('rotate produced no output file');
    return ok(output, `rotated ${file} ${deg}° -> ${output}`);
}

/** EXTRACT AUDIO — pull the audio track out of a video as an mp3. */
export async function extractAudio(file: string, out?: string): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    let p = out ?? path.join(process.cwd(), 'output', `audio_${Date.now()}.mp3`);
    if (!path.extname(p)) p += '.mp3';
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const { code, out: log } = await runFfmpeg(['-i', file, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', p]);
    if (code !== 0) return fail(`ffmpeg extract-audio failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(p)) return fail('extract-audio produced no output file');
    return ok(p, `extracted audio from ${file} -> ${p}`);
}
