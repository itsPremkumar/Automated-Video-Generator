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
        // ffmpeg stderr always starts with its version banner — skip it and
        // capture the actual error lines (after the first "Input #0" or "Error").
        const errLines = stderr.split('\n').filter(l =>
            /error|failed|invalid|unknown|cannot|not found|no such|bitstream|unsupported/i.test(l)
        );
        const detail = errLines.length > 0 ? errLines.join('; ').slice(0, 300) : stderr.slice(0, 300);
        throw new Error(`Trim failed (exit ${code}): ${detail}`);
    }
    return outputPath;
}
