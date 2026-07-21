/**
 * src/music-system/processing/trim.ts
 * Trim audio to target duration using ffmpeg.
 */

import { runFfmpeg } from '../providers/base';

/**
 * Trim audio to exactly `targetDurationSec` seconds.
 * If source is shorter, the output will be the source duration (no padding).
 */
export async function trimAudio(
    inputPath: string,
    outputPath: string,
    targetDurationSec: number,
): Promise<string> {
    const args = [
        '-i', inputPath,
        '-t', String(targetDurationSec),
        '-c', 'copy',
        '-y',
        outputPath,
    ];

    const { code, stderr } = await runFfmpeg(args, 30_000);
    if (code !== 0) {
        throw new Error(`Trim failed (exit ${code}): ${stderr.slice(0, 200)}`);
    }
    return outputPath;
}
