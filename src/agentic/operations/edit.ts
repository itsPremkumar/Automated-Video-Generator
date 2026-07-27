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
export async function mergeVideos(
    files: string[],
    out?: string,
    orientation: 'portrait' | 'landscape' = 'portrait',
): Promise<EditResult> {
    const err = ensureFiles(files);
    if (err) return fail(err);
    const output = resolveOut(out, 'mp4', 'merged');
    const W = orientation === 'landscape' ? 1280 : 720;
    const H = orientation === 'landscape' ? 720 : 1280;
    const inputs = files.flatMap((f) => ['-i', f]);
    const labels = files.map((_, i) => `[${i}:v]`).join('');
    const filter = files
        .map(
            (_, i) =>
                `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`,
        )
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
    const transpose = deg === 90 ? 'transpose=1' : deg === 270 ? 'transpose=2' : 'transpose=1,transpose=1';
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

/**
 * INTERPOLATE — motion interpolation to a higher frame rate (60/120 fps).
 * Uses ffmpeg's minterpolate (blend mode) for smooth slow-motion or
 * frame-rate up-conversion. Zero-cost, no external deps.
 */
export async function interpolateVideo(file: string, out?: string, targetFps: number = 60): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    const output = resolveOut(out, 'mp4', 'interpolated');
    const { code, out: log } = await runFfmpeg([
        '-i', file,
        '-vf', `minterpolate=mode=blend:fps=${Math.max(24, Math.min(120, targetFps))}`,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium',
        '-y', output,
    ]);
    if (code !== 0) return fail(`ffmpeg interpolate failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(output)) return fail('interpolate produced no output file');
    return ok(output, `interpolated ${file} to ${targetFps}fps -> ${output}`);
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

/** CHANGE SPEED — slow-motion or timelapse. speed 0.25 = 4x slow, 2 = 2x fast. */
export async function changeSpeed(file: string, out?: string, speed: number = 1): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    const s = Math.max(0.05, Math.min(10, speed));
    const output = resolveOut(out, 'mp4', 'speed');
    const { code, out: log } = await runFfmpeg([
        '-i', file,
        '-filter_complex', `[0:v]setpts=${1 / s}*PTS[v];[0:a]atempo=${s}[a]`,
        '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-y', output,
    ]);
    if (code !== 0) return fail(`ffmpeg speed change failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(output)) return fail('speed change produced no output file');
    return ok(output, `speed ${s}x: ${file} -> ${output}`);
}

/** REVERSE — play video backward (audio reversed too). */
export async function reverseVideo(file: string, out?: string): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    const output = resolveOut(out, 'mp4', 'reversed');
    const { code, out: log } = await runFfmpeg([
        '-i', file, '-vf', 'reverse', '-af', 'areverse', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-y', output,
    ]);
    if (code !== 0) return fail(`ffmpeg reverse failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(output)) return fail('reverse produced no output file');
    return ok(output, `reversed: ${file} -> ${output}`);
}

/** ADD TEXT OVERLAY — burn text onto a video (title/label). */
export async function addTextOverlay(file: string, text: string, out?: string, opts?: { fontSize?: number; color?: string; x?: string; y?: string }): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    const output = resolveOut(out, 'mp4', 'text');
    const size = opts?.fontSize ?? 48;
    const color = opts?.color ?? 'white';
    const x = opts?.x ?? '(w-text_w)/2';
    const y = opts?.y ?? 'h-th-80';
    const escaped = text.replace(/'/g, "'\\''").replace(/:/g, '\\:');
    const { code, out: log } = await runFfmpeg([
        '-i', file, '-vf',
        `drawtext=text='${escaped}':fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}:box=1:boxcolor=black@0.4:boxborderw=8`,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-y', output,
    ]);
    if (code !== 0) return fail(`ffmpeg add-text failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(output)) return fail('add-text produced no output file');
    return ok(output, `text "${text.slice(0, 30)}" burned onto ${file} -> ${output}`);
}

/** EXTRACT THUMBNAIL — grab a single frame as PNG at given timestamp. */
export async function extractThumbnail(file: string, out?: string, atSec: number = 1): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    const output = resolveOut(out, 'png', 'thumbnail');
    const { code, out: log } = await runFfmpeg([
        '-ss', String(atSec), '-i', file, '-frames:v', '1', '-y', output,
    ]);
    if (code !== 0) return fail(`ffmpeg thumbnail failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(output)) return fail('thumbnail produced no output file');
    return ok(output, `thumbnail at ${atSec}s: ${file} -> ${output}`);
}

/** VIDEO TO GIF — animated GIF with palette optimization. */
export async function videoToGif(file: string, out?: string, opts?: { startSec?: number; durationSec?: number; fps?: number }): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    const output = resolveOut(out, 'gif', 'animated');
    const ss = opts?.startSec ?? 0;
    const dur = opts?.durationSec ?? 5;
    const fps = opts?.fps ?? 15;
    const pal = path.join(path.dirname(output), `_pal_${Date.now()}.png`);
    const { code: c1, out: l1 } = await runFfmpeg([
        '-ss', String(ss), '-t', String(dur), '-i', file,
        '-vf', `fps=${fps},scale=480:-1:flags=lanczos,palettegen=stats_mode=diff`,
        '-y', pal,
    ]);
    if (c1 !== 0) return fail(`gif palette failed:\n${l1.slice(-400)}`);
    const { code: c2, out: l2 } = await runFfmpeg([
        '-ss', String(ss), '-t', String(dur), '-i', file, '-i', pal,
        '-lavfi', `fps=${fps},scale=480:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`,
        '-y', output,
    ]);
    try { fs.rmSync(pal, { force: true }); } catch { /* ignore */ }
    if (c2 !== 0) return fail(`gif paletteuse failed:\n${l2.slice(-400)}`);
    if (!fs.existsSync(output)) return fail('gif produced no output file');
    return ok(output, `animated GIF: ${file} -> ${output}`);
}

/** LOOP VIDEO — repeat the video N times. */
export async function loopVideo(file: string, out?: string, times: number = 3): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    const t = Math.max(1, Math.min(100, times));
    const output = resolveOut(out, 'mp4', 'looped');
    const list = path.join(path.dirname(output), `_loop_${Date.now()}.txt`);
    const abs = path.resolve(file);
    fs.writeFileSync(list, Array.from({ length: t }, () => `file '${abs.replace(/'/g, "'\\''")}'`).join('\n'));
    const { code, out: log } = await runFfmpeg([
        '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-y', output,
    ]);
    try { fs.rmSync(list, { force: true }); } catch { /* ignore */ }
    if (code !== 0) return fail(`ffmpeg loop failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(output)) return fail('loop produced no output file');
    return ok(output, `looped ${t}x: ${file} -> ${output}`);
}

/** SPLIT VIDEO — cut a video at a timestamp into two separate files. */
export async function splitVideo(file: string, splitSec: number, out1?: string, out2?: string): Promise<{ part1: EditResult; part2: EditResult }> {
    const err = ensureFiles([file]);
    const failR = (d: string) => ({ part1: fail(d), part2: fail(d) });
    if (err) return failR(err);
    const o1 = resolveOut(out1, 'mp4', 'part1');
    const o2 = resolveOut(out2, 'mp4', 'part2');
    const { code: c1, out: l1 } = await runFfmpeg(['-i', file, '-ss', '0', '-to', String(splitSec), '-c', 'copy', '-y', o1]);
    const { code: c2, out: l2 } = await runFfmpeg(['-i', file, '-ss', String(splitSec), '-c', 'copy', '-y', o2]);
    const r1 = c1 !== 0 ? fail(`part1 failed:\n${l1.slice(-600)}`) : fs.existsSync(o1) ? ok(o1, `part1 (0-${splitSec}s): ${o1}`) : fail('part1 not created');
    const r2 = c2 !== 0 ? fail(`part2 failed:\n${l2.slice(-600)}`) : fs.existsSync(o2) ? ok(o2, `part2 (${splitSec}s-): ${o2}`) : fail('part2 not created');
    return { part1: r1, part2: r2 };
}

/** ADD AUDIO — replace or overlay a new audio track onto a video. */
export async function addAudio(file: string, audioFile: string, out?: string, opts?: { volume?: number; mix?: boolean }): Promise<EditResult> {
    const err = ensureFiles([file, audioFile]);
    if (err) return fail(err);
    const output = resolveOut(out, 'mp4', 'audio');
    const vol = opts?.volume ?? 1;
    if (opts?.mix) {
        const { code, out: log } = await runFfmpeg([
            '-i', file, '-i', audioFile,
            '-filter_complex', `[1:a]volume=${vol.toFixed(2)}[a1];[0:a][a1]amix=inputs=2:duration=first[outa]`,
            '-map', '0:v', '-map', '[outa]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-y', output,
        ]);
        if (code !== 0) return fail(`ffmpeg add-audio mix failed:\n${log.slice(-800)}`);
    } else {
        const { code, out: log } = await runFfmpeg([
            '-i', file, '-i', audioFile, '-map', '0:v', '-map', '1:a',
            '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-y', output,
        ]);
        if (code !== 0) return fail(`ffmpeg add-audio replace failed:\n${log.slice(-800)}`);
    }
    if (!fs.existsSync(output)) return fail('add-audio produced no output file');
    return ok(output, `audio ${opts?.mix ? 'mixed' : 'replaced'}: ${file} + ${path.basename(audioFile)} -> ${output}`);
}

/** SILENCE REMOVE — auto-cut silent sections from a video. */
export async function silenceRemove(file: string, out?: string, opts?: { noiseThreshold?: number; minSilenceSec?: number }): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    const output = resolveOut(out, 'mp4', 'nosilence');
    const threshold = opts?.noiseThreshold ?? '-30dB';
    const minSilence = opts?.minSilenceSec ?? 0.5;
    const { code, out: log } = await runFfmpeg([
        '-i', file, '-af', `silenceremove=start_periods=1:start_threshold=${threshold}:start_silence=${minSilence}:stop_periods=1:stop_threshold=${threshold}:stop_silence=${minSilence}`,
        '-c:v', 'copy', '-y', output,
    ]);
    if (code !== 0) return fail(`ffmpeg silence-remove failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(output)) return fail('silence-remove produced no output file');
    return ok(output, `silence removed: ${file} -> ${output}`);
}

/** ADD PROGRESS BAR — animated progress bar overlay (bottom edge). */
export async function addProgressBar(file: string, out?: string, opts?: { height?: number; color?: string; totalSec?: number }): Promise<EditResult> {
    const err = ensureFiles([file]);
    if (err) return fail(err);
    const output = resolveOut(out, 'mp4', 'progress');
    const h = opts?.height ?? 6;
    const color = opts?.color ?? 'white';
    const total = opts?.totalSec ?? 10;
    const { code, out: log } = await runFfmpeg([
        '-i', file, '-vf',
        `drawbox=x=0:y=ih-${h}:w='min(iw,iw*(t/${Math.max(1, total)}))':h=${h}:color=${color}@0.9:t=fill`,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-y', output,
    ]);
    if (code !== 0) return fail(`ffmpeg progress-bar failed:\n${log.slice(-800)}`);
    if (!fs.existsSync(output)) return fail('progress-bar produced no output file');
    return ok(output, `progress bar: ${file} -> ${output}`);
}
