/**
 * overlay.ts — add watermark / lower-third / progress-bar to an EXISTING
 * clip (single task). Zero-cost ffmpeg drawtext/drawbox only.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';

function fontSafe(): string | null {
    const c = [
        'C:/Windows/Fonts/arial.ttf',
        'C:/Windows/Fonts/seguiemj.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    ];
    return c.find((f) => fs.existsSync(f)) ?? null;
}
/** Build the drawtext fontfile clause only when a real font file exists;
 *  otherwise omit it and let ffmpeg/fontconfig pick a system default. */
function fontClause(): string {
    const f = fontSafe();
    return f ? `fontfile='${f.replace(/\\\\/g, '/')}':` : '';
}
function escape(t: string): string {
    return t.replace(/:/g, '\\:').replace(/'/g, "'\\''").replace(/"/g, '\\"').replace(/,/g, '\\,').replace(/\\/g, '/');
}

export interface OverlayResult {
    ok: boolean;
    output?: string;
    detail: string;
}

/** Burn a small corner watermark (text label). */
export async function addWatermark(
    file: string,
    label: string,
    out?: string,
    position: 'br' | 'bl' | 'tr' | 'tl' = 'br',
): Promise<OverlayResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const output = out ?? path.join(process.cwd(), 'output', `wm_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const xy: Record<string, string> = { br: 'w-tw-20:h-th-20', bl: '20:h-th-20', tr: 'w-tw-20:20', tl: '20:20' };
    const [x, y] = xy[position].split(':');
    const vf = `drawtext=${fontClause()}text='${escape(label)}':fontcolor=white@0.7:fontsize=28:x=${x}:y=${y}`;
    const { code, out: log } = await runFfmpeg([
        '-i',
        file,
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'copy',
        '-y',
        output,
    ]);
    if (code !== 0) return { ok: false, detail: `watermark failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'output not produced' };
    return { ok: true, output, detail: `watermarked "${label}" on ${file}` };
}

/** Burn a lower-third name/title bar. */
export async function addLowerThird(file: string, text: string, out?: string): Promise<OverlayResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const output = out ?? path.join(process.cwd(), 'output', `lt_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const vf = `drawbox=x=0:y=h-140:w=iw:h=140:color=black@0.55:t=fill,drawtext=${fontClause()}text='${escape(text)}':fontcolor=white:fontsize=30:x=30:y=h-100`;
    const { code, out: log } = await runFfmpeg([
        '-i',
        file,
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'copy',
        '-y',
        output,
    ]);
    if (code !== 0) return { ok: false, detail: `lower-third failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'output not produced' };
    return { ok: true, output, detail: `lower-third "${text}" on ${file}` };
}

/** Burn a progress bar at the bottom. */
export async function addProgressBar(file: string, out?: string): Promise<OverlayResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const output = out ?? path.join(process.cwd(), 'output', `pb_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const ffprobe: string = (() => {
        try {
            return require('ffprobe-static').path;
        } catch {
            return 'ffprobe';
        }
    })();
    const durStr =
        require('child_process').execFileSync(
            ffprobe,
            ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
            { encoding: 'utf-8' },
        ) || '10';
    const dur = parseFloat(durStr) || 10;
    const vf = `drawbox=x=0:y=h-10:w='iw*t/${dur.toFixed(2)}':h=10:color=white@0.9:t=fill,drawbox=x=0:y=h-10:w=iw:h=10:color=white@0.2:t=fill`;
    const { code, out: log } = await runFfmpeg([
        '-i',
        file,
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'copy',
        '-y',
        output,
    ]);
    if (code !== 0) return { ok: false, detail: `progress-bar failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'output not produced' };
    return { ok: true, output, detail: `progress bar on ${file}` };
}
