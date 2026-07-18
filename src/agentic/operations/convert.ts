/**
 * convert.ts — format / container / codec CONVERSION (single task).
 * Zero-cost ffmpeg only. Covers the everyday "I need this in .webm / .gif /
 * .mov / .mp3" requests a normal video editor hears.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';

export interface ConvertResult { ok: boolean; output?: string; detail: string; }

function ensureFile(file: string): string | null {
    if (!fs.existsSync(file)) return `input not found: ${file}`;
    return null;
}

/** Convert container/codec (mp4<->webm<->mov<->mkv<->avi). */
export async function convertFormat(file: string, target: string, out?: string): Promise<ConvertResult> {
    const err = ensureFile(file);
    if (err) return { ok: false, detail: err };
    const ext = target.replace(/^\./, '').toLowerCase();
    const output = out ?? path.join(process.cwd(), 'output', `conv_${Date.now()}.${ext}`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const acodec = ext === 'webm' ? 'libopus' : 'aac';
    const vcodec = ext === 'webm' ? 'libvpx-vp9' : ext === 'gif' ? 'gif' : 'libx264';
    const { code, out: log } = await runFfmpeg(['-i', file, '-c:v', vcodec, '-c:a', acodec, '-y', output]);
    if (code !== 0) return { ok: false, detail: `convert failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'converted file not produced' };
    return { ok: true, output, detail: `converted ${file} -> .${ext}` };
}

/** Export the video as an animated GIF (great for social/memes). */
export async function toGif(file: string, out?: string, fps = 15, width = 480): Promise<ConvertResult> {
    const err = ensureFile(file);
    if (err) return { ok: false, detail: err };
    const output = out ?? path.join(process.cwd(), 'output', `clip_${Date.now()}.gif`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const vf = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
    const { code, out: log } = await runFfmpeg(['-i', file, '-vf', vf, '-y', output]);
    if (code !== 0) return { ok: false, detail: `gif failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'gif not produced' };
    return { ok: true, output, detail: `exported GIF from ${file}` };
}

/** Convert an audio file to another audio format (mp3/wav/ogg/m4a). */
export async function convertAudio(file: string, target: string, out?: string): Promise<ConvertResult> {
    const err = ensureFile(file);
    if (err) return { ok: false, detail: err };
    const ext = target.replace(/^\./, '').toLowerCase();
    const output = out ?? path.join(process.cwd(), 'output', `audio_${Date.now()}.${ext}`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const acodec = ext === 'mp3' ? 'libmp3lame' : ext === 'ogg' ? 'libopus' : ext === 'm4a' ? 'aac' : 'pcm_s16le';
    const { code, out: log } = await runFfmpeg(['-i', file, '-c:a', acodec, '-y', output]);
    if (code !== 0) return { ok: false, detail: `audio convert failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'audio not produced' };
    return { ok: true, output, detail: `converted audio -> .${ext}` };
}
