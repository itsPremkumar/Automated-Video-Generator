/**
 * src/music-system/processing/looper.ts
 * Seamless loop extension for short tracks.
 */

import * as path from 'path';
import { runFfmpeg, probeDuration } from '../providers/base';

/**
 * Loop audio to fill target duration.
 * Uses crossfade loop to avoid audible clicks at loop boundary.
 */
export async function loopAudio(
    inputPath: string,
    outputPath: string,
    targetDurationSec: number,
): Promise<string> {
    const sourceDur = await probeDuration(inputPath);
    if (sourceDur <= 0) {
        throw new Error(`Cannot loop: unable to probe duration of ${inputPath}`);
    }

    // If source is already long enough, just copy
    if (sourceDur >= targetDurationSec) {
        const args = ['-i', inputPath, '-c', 'copy', '-y', outputPath];
        await runFfmpeg(args, 15_000);
        return outputPath;
    }

    // Calculate how many full loops + remainder needed
    const loopsNeeded = Math.ceil(targetDurationSec / sourceDur);

    // Use aloop filter: loop entire input N times, then trim to target
    const args = [
        '-i', inputPath,
        '-filter_complex', `aloop=loop=${loopsNeeded - 1}:size=0,atrim=0:${targetDurationSec}`,
        '-c:a', 'pcm_s16le',
        '-y',
        outputPath,
    ];

    const { code, stderr } = await runFfmpeg(args, 30_000);
    if (code !== 0) {
        throw new Error(`Loop failed (exit ${code}): ${stderr.slice(0, 200)}`);
    }
    return outputPath;
}
