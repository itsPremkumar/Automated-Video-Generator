/**
 * demux.ts — separate / mute audio+video streams (single-task ops).
 * ZERO-COST: ffmpeg-static only. New standalone module.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';

export interface DemuxResult {
    ok: boolean;
    output?: string;
    detail: string;
}

function ensureFile(file: string): string | null {
    if (!fs.existsSync(file)) return `input not found: ${file}`;
    return null;
}

/** Pull the audio stream out as a standalone file (mp3). */
export async function separateAudio(file: string, out?: string): Promise<DemuxResult> {
    const err = ensureFile(file);
    if (err) return { ok: false, detail: err };
    const output = out ?? path.join(process.cwd(), 'output', `audio_${Date.now()}.mp3`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const { code, out: log } = await runFfmpeg(['-i', file, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', '-y', output]);
    if (code !== 0) return { ok: false, detail: `separate audio failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'no audio output' };
    return { ok: true, output, detail: `extracted audio -> ${output}` };
}

/** Pull the silent video stream (drop audio). */
export async function separateVideo(file: string, out?: string): Promise<DemuxResult> {
    const err = ensureFile(file);
    if (err) return { ok: false, detail: err };
    const output = out ?? path.join(process.cwd(), 'output', `silent_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const { code, out: log } = await runFfmpeg(['-i', file, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', output]);
    if (code !== 0) return { ok: false, detail: `separate video failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'no video output' };
    return { ok: true, output, detail: `silent video -> ${output}` };
}

/** Remove the audio track entirely (alias of separate_video convenience). */
export async function muteVideo(file: string, out?: string): Promise<DemuxResult> {
    return separateVideo(file, out ?? path.join(process.cwd(), 'output', `muted_${Date.now()}.mp4`));
}
