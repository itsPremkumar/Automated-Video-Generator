/**
 * autocut/scene-detect.ts — AutoCut scene detection + smart assembly.
 *
 * Detects scene changes and assembles a coherent edit.
 * Identity-preserving: ffmpeg-based, no external deps.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../../shared/logging/runtime-logging.js';

export interface Scene {
    startTime: number;
    endTime: number;
    duration: number;
    score: number;  // interestingness score
}

export interface AutoCutOptions {
    inputPath: string;
    outputPath: string;
    targetDuration?: number;     // target output duration in seconds
    minSceneDuration?: number;   // minimum scene duration (default 1.0)
    maxSceneDuration?: number;   // maximum scene duration (default 5.0)
    sensitivity?: number;        // scene change sensitivity 0-1 (default 0.3)
    addTransitions?: boolean;
    transitionDuration?: number;
}

/** Detect scenes in a video using ffmpeg scene filter */
export async function detectScenes(
    videoPath: string,
    sensitivity: number = 0.3,
): Promise<Scene[]> {
    if (!fs.existsSync(videoPath)) {
        throw new Error(`Video not found: ${videoPath}`);
    }

    const threshold = (1 - sensitivity).toFixed(2);

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
            '-i', videoPath,
            '-vf', `select='gt(scene,${threshold})',showinfo`,
            '-f', 'null',
            '-',
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', () => {
            // Parse scene change timestamps from showinfo output
            const scenes: Scene[] = [];
            const ptsMatches = stderr.match(/pts_time:([\d.]+)/g) || [];
            const timestamps = ptsMatches.map(m => parseFloat(m.replace('pts_time:', '')));

            // Get video duration
            const durationMatch = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
            let videoDuration = 0;
            if (durationMatch) {
                videoDuration = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseFloat(durationMatch[3]);
            }

            for (let i = 0; i < timestamps.length; i++) {
                scenes.push({
                    startTime: timestamps[i],
                    endTime: i < timestamps.length - 1 ? timestamps[i + 1] : videoDuration,
                    duration: (i < timestamps.length - 1 ? timestamps[i + 1] : videoDuration) - timestamps[i],
                    score: 1.0,
                });
            }

            logInfo(`[AUTOCUT] Detected ${scenes.length} scenes`);
            resolve(scenes);
        });
    });
}

/** Smart assembly: pick best scenes and assemble */
export async function smartAssemble(options: AutoCutOptions): Promise<string> {
    const {
        inputPath,
        outputPath,
        targetDuration = 30,
        minSceneDuration = 1.0,
        maxSceneDuration = 5.0,
        addTransitions = true,
        transitionDuration = 0.5,
    } = options;

    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input not found: ${inputPath}`);
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Detect scenes
    const scenes = await detectScenes(inputPath);

    // Filter and score scenes
    const selectedScenes = scenes.filter(s => s.duration >= minSceneDuration);

    // Sort by score and pick top scenes to fill target duration
    selectedScenes.sort((a, b) => b.score - a.score);

    let totalDuration = 0;
    const finalScenes: Scene[] = [];
    for (const scene of selectedScenes) {
        if (totalDuration >= targetDuration) break;
        const clampedDuration = Math.min(scene.duration, maxSceneDuration);
        finalScenes.push({ ...scene, duration: clampedDuration });
        totalDuration += clampedDuration;
    }

    // Sort by time
    finalScenes.sort((a, b) => a.startTime - b.startTime);

    if (finalScenes.length === 0) {
        logWarn('[AUTOCUT] No scenes found, copying input');
        fs.copyFileSync(inputPath, outputPath);
        return outputPath;
    }

    // Assemble with concat filter
    const filterParts: string[] = [];
    const concatInputs: string[] = [];

    for (let i = 0; i < finalScenes.length; i++) {
        const scene = finalScenes[i];
        filterParts.push(
            `[0:v]trim=start=${scene.startTime}:end=${scene.startTime + scene.duration},setpts=PTS-STARTPTS[v${i}]`
        );
        filterParts.push(
            `[0:a]atrim=start=${scene.startTime}:end=${scene.startTime + scene.duration},asetpts=PTS-STARTPTS[a${i}]`
        );
        concatInputs.push(`[v${i}][a${i}]`);
    }

    const fullFilter = [
        ...filterParts,
        `${concatInputs.join('')}concat=n=${finalScenes.length}:v=1:a=1[vout][aout]`,
    ].join(';');

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
            '-i', inputPath,
            '-filter_complex', fullFilter,
            '-map', '[vout]',
            '-map', '[aout]',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-y', outputPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                logWarn(`[AUTOCUT] assemble failed: ${code}`);
                reject(new Error(`Smart assembly failed: ${code}`));
                return;
            }
            logInfo(`[AUTOCUT] Assembled ${finalScenes.length} scenes → ${outputPath}`);
            resolve(outputPath);
        });
    });
}

/** Quick auto-cut: detect scenes and pick best segments */
export async function quickAutoCut(
    inputPath: string,
    outputPath: string,
    targetDuration: number = 30,
): Promise<string> {
    return smartAssemble({ inputPath, outputPath, targetDuration });
}
