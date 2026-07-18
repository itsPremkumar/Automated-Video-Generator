/**
 * demux.ts — SEPARATE audio and video streams (single task). Zero-cost ffmpeg.
 *
 *  - extractAudioStream: pull the audio track out as a standalone file
 *    (re-encode to a chosen format). Distinct from extractAudio in edit.ts
 *    which is the canonical single-task; this covers "give me just the audio
 *    file in .wav/.m4a".
 *  - extractVideoStream: produce a SILENT video (no audio track).
 *  - muteVideo: keep the video but remove/zero the audio track.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';

export interface DemuxResult {
    ok: boolean;
    output?: string;
    detail: string;
}

export async function extractAudioStream(
    file: string,
    out?: string,
    fmt: 'mp3' | 'wav' | 'm4a' = 'mp3',
): Promise<DemuxResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const output = out ?? path.join(process.cwd(), 'output', `audio_${Date.now()}.${fmt}`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const acodec = fmt === 'mp3' ? 'libmp3lame' : fmt === 'm4a' ? 'aac' : 'pcm_s16le';
    const { code, out: log } = await runFfmpeg(['-i', file, '-vn', '-c:a', acodec, '-y', output]);
    if (code !== 0) return { ok: false, detail: `audio extract failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'audio not produced' };
    return { ok: true, output, detail: `extracted audio -> ${output}` };
}

export async function extractVideoStream(file: string, out?: string): Promise<DemuxResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const output = out ?? path.join(process.cwd(), 'output', `silent_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const { code, out: log } = await runFfmpeg([
        '-i',
        file,
        '-an',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-y',
        output,
    ]);
    if (code !== 0) return { ok: false, detail: `video extract failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'video not produced' };
    return { ok: true, output, detail: `extracted silent video -> ${output}` };
}

export async function muteVideo(file: string, out?: string): Promise<DemuxResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const output = out ?? path.join(process.cwd(), 'output', `muted_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const { code, out: log } = await runFfmpeg([
        '-i',
        file,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-y',
        output,
    ]);
    if (code !== 0) return { ok: false, detail: `mute failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'video not produced' };
    return { ok: true, output, detail: `muted -> ${output}` };
}
