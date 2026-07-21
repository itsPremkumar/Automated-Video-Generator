/**
 * src/music-system/processing/normalize.ts
 * Loudness normalization to EBU R128 standard (-23 LUFS).
 */

import { runFfmpeg } from '../providers/base';

/**
 * Normalize audio loudness to target LUFS level using EBU R128.
 * Default: -23 LUFS (broadcast standard).
 */
export async function normalizeLoudness(
    inputPath: string,
    outputPath: string,
    targetLufs: number = -23,
): Promise<string> {
    const args = [
        '-i', inputPath,
        '-af', `loudnorm=I=${targetLufs}:LRA=7:TP=-2`,
        '-c:a', 'pcm_s16le',
        '-y',
        outputPath,
    ];

    const { code, stderr } = await runFfmpeg(args, 30_000);
    if (code !== 0) {
        throw new Error(`Normalize failed (exit ${code}): ${stderr.slice(0, 200)}`);
    }
    return outputPath;
}
