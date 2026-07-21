/**
 * src/music-system/processing/fade.ts
 * Apply intro/outro fade to audio using ffmpeg.
 */

import { runFfmpeg } from '../providers/base';

export interface FadeOptions {
    fadeInSec: number;
    fadeOutSec: number;
    totalDurationSec: number;
}

export async function applyFade(
    inputPath: string,
    outputPath: string,
    opts: FadeOptions,
): Promise<string> {
    const fadeOutStart = Math.max(0, opts.totalDurationSec - opts.fadeOutSec);
    const filter = `afade=t=in:st=0:d=${opts.fadeInSec},afade=t=out:st=${fadeOutStart}:d=${opts.fadeOutSec}`;

    const args = [
        '-i', inputPath,
        '-af', filter,
        '-c:a', 'pcm_s16le', // re-encode to apply fade
        '-y',
        outputPath,
    ];

    const { code, stderr } = await runFfmpeg(args, 30_000);
    if (code !== 0) {
        throw new Error(`Fade failed (exit ${code}): ${stderr.slice(0, 200)}`);
    }
    return outputPath;
}
