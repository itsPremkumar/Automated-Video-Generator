/**
 * video/speed-ramp.ts — Variable speed (speed ramping) for video clips.
 *
 * Supports: slow motion, time-lapse, speed ramps between segments.
 * Identity-preserving: ffmpeg-based, no external deps.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../shared/logging/runtime-logging.js';

export interface SpeedSegment {
    startTime: number;
    endTime: number;
    speed: number;       // 0.5 = half speed, 2.0 = double speed
}

export interface SpeedRampOptions {
    inputPath: string;
    outputPath: string;
    segments?: SpeedSegment[];
    globalSpeed?: number;  // apply uniform speed change
}

/** Apply speed change to video */
export async function applySpeedChange(options: SpeedRampOptions): Promise<string> {
    const { inputPath, outputPath, globalSpeed = 1.0 } = options;

    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input not found: ${inputPath}`);
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // setpts for video atempo for audio
    const videoFactor = 1.0 / globalSpeed;
    const audioAtempo = globalSpeed;

    // atempo range is 0.5 to 2.0, chain multiple if needed
    const atempoFilters = buildAtempoChain(audioAtempo);

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
            '-i', inputPath,
            '-filter_complex',
            `[0:v]setpts=${videoFactor}*PTS[v];[0:a]${atempoFilters}[a]`,
            '-map', '[v]',
            '-map', '[a]',
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
                logWarn(`[SPEED] ffmpeg exited ${code}: ${stderr.slice(-200)}`);
                reject(new Error(`Speed change failed: ${code}`));
                return;
            }
            logInfo(`[SPEED] Applied ${globalSpeed}x speed → ${outputPath}`);
            resolve(outputPath);
        });
    });
}

/** Build atempo filter chain for arbitrary speed */
function buildAtempoChain(speed: number): string {
    if (speed >= 0.5 && speed <= 2.0) {
        return `atempo=${speed}`;
    }

    // Chain multiple atempo filters for extreme speeds
    const factors: number[] = [];
    let remaining = speed;

    while (remaining > 2.0) {
        factors.push(2.0);
        remaining /= 2.0;
    }
    while (remaining < 0.5) {
        factors.push(0.5);
        remaining /= 0.5;
    }
    factors.push(remaining);

    return factors.map(f => `atempo=${f}`).join(',');
}

/** Create slow motion effect */
export async function slowMotion(
    inputPath: string,
    outputPath: string,
    speed: number = 0.5,
): Promise<string> {
    return applySpeedChange({ inputPath, outputPath, globalSpeed: speed });
}

/** Create time-lapse effect */
export async function timeLapse(
    inputPath: string,
    outputPath: string,
    speed: number = 4.0,
): Promise<string> {
    return applySpeedChange({ inputPath, outputPath, globalSpeed: speed });
}

/** Apply speed ramp (variable speed within clip) */
export async function applySpeedRamp(options: SpeedRampOptions): Promise<string> {
    const { inputPath, outputPath, segments = [], globalSpeed = 1.0 } = options;

    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input not found: ${inputPath}`);
    }

    if (segments.length === 0 && globalSpeed !== 1.0) {
        return applySpeedChange(options);
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Build complex filter for variable speed
    const filterParts: string[] = [];
    const audioParts: string[] = [];

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const videoFactor = 1.0 / seg.speed;
        const atempo = buildAtempoChain(seg.speed);

        filterParts.push(
            `[0:v]trim=start=${seg.startTime}:end=${seg.endTime},setpts=${videoFactor}*PTS[v${i}]`
        );
        audioParts.push(
            `[0:a]atrim=start=${seg.startTime}:end=${seg.endTime},${atempo}[a${i}]`
        );
    }

    // Concatenate segments
    const vConcat = segments.map((_, i) => `[v${i}]`).join('');
    const aConcat = segments.map((_, i) => `[a${i}]`).join('');

    const fullFilter = [
        ...filterParts,
        ...audioParts,
        `${vConcat}concat=n=${segments.length}:v=1:a=0[vout]`,
        `${aConcat}concat=n=${segments.length}:v=0:a=1[aout]`,
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
                logWarn(`[SPEED] ramp failed: ${code}`);
                reject(new Error(`Speed ramp failed: ${code}`));
                return;
            }
            logInfo(`[SPEED] Applied speed ramp → ${outputPath}`);
            resolve(outputPath);
        });
    });
}

/** Create cinematic slow-mo with smooth ramp */
export async function cinematicSlowMo(
    inputPath: string,
    outputPath: string,
    rampIn: number = 0.3,
    hold: number = 0.4,
    rampOut: number = 0.3,
): Promise<string> {
    const duration = await getDuration(inputPath);
    const segments: SpeedSegment[] = [
        { startTime: 0, endTime: duration * rampIn, speed: 0.5 },
        { startTime: duration * rampIn, endTime: duration * (rampIn + hold), speed: 0.25 },
        { startTime: duration * (rampIn + hold), endTime: duration, speed: 1.0 },
    ];
    return applySpeedRamp({ inputPath, outputPath, segments });
}

async function getDuration(videoPath: string): Promise<number> {
    return new Promise((resolve) => {
        const proc = spawn('ffprobe', [
            '-v', 'quiet',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            videoPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stdout = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.on('close', () => resolve(parseFloat(stdout.trim()) || 0));
    });
}
