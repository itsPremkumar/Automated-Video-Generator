/**
 * enhance/noise-reduction.ts — Audio noise reduction.
 *
 * Uses ffmpeg afftdn filter for noise reduction.
 * Identity-preserving: ffmpeg-based, no external deps.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../../shared/logging/runtime-logging.js';

export interface NoiseReductionOptions {
    inputPath: string;
    outputPath: string;
    strength?: number;       // 0.0-1.0, default 0.5
    sensitivity?: number;    // 0.0-1.0, default 0.5
}

/** Apply noise reduction to audio */
export async function reduceNoise(options: NoiseReductionOptions): Promise<string> {
    const { inputPath, outputPath, strength = 0.5, sensitivity = 0.5 } = options;

    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input not found: ${inputPath}`);
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // afftdn: adaptive FFT-based noise reduction
    const noiseReduction = Math.round(strength * 100);
    const noiseFloor = Math.round(-30 - (sensitivity * 20));

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
            '-i', inputPath,
            '-af', `afftdn=${noiseReduction}:nf=${noiseFloor}`,
            '-c:a', 'aac',
            '-b:a', '192k',
            '-y', outputPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                logWarn(`[NOISE] ffmpeg exited ${code}: ${stderr.slice(-200)}`);
                reject(new Error(`Noise reduction failed: ${code}`));
                return;
            }
            logInfo(`[NOISE] Reduced noise → ${outputPath}`);
            resolve(outputPath);
        });
    });
}

/** Apply noise reduction to video (audio track only) */
export async function reduceVideoNoise(
    videoPath: string,
    outputPath: string,
    strength: number = 0.5,
): Promise<string> {
    if (!fs.existsSync(videoPath)) {
        throw new Error(`Video not found: ${videoPath}`);
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const noiseReduction = Math.round(strength * 100);

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
            '-i', videoPath,
            '-c:v', 'copy',
            '-af', `afftdn=${noiseReduction}`,
            '-c:a', 'aac',
            '-b:a', '192k',
            '-y', outputPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                logWarn(`[NOISE] video noise reduction failed: ${code}`);
                reject(new Error(`Video noise reduction failed: ${code}`));
                return;
            }
            resolve(outputPath);
        });
    });
}
