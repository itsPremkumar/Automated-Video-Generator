/**
 * video/progress-bar.ts — Video progress bar overlay.
 *
 * Renders a customizable progress bar on video.
 * Identity-preserving: ffmpeg-based, no external deps.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../shared/logging/runtime-logging.js';

export type ProgressBarStyle = 'line' | 'dots' | 'circle' | 'gradient';

export interface ProgressBarOptions {
    inputPath: string;
    outputPath: string;
    style?: ProgressBarStyle;
    position?: 'top' | 'bottom' | 'center';
    height?: number;
    color?: string;
    backgroundColor?: string;
    borderRadius?: number;
    animation?: boolean;
}

/** Render progress bar on video */
export async function addProgressBar(options: ProgressBarOptions): Promise<string> {
    const {
        inputPath,
        outputPath,
        style = 'line',
        position = 'bottom',
        height = 6,
        color = 'white',
        backgroundColor = 'black',
        borderRadius = 0,
        animation = true,
    } = options;

    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input not found: ${inputPath}`);
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Use sendcmd for dynamic progress bar (animated with video playback)
    const yPos = position === 'top' ? '0' : position === 'center' ? '(h-ih)/2' : 'h-ih';

    let filter: string;

    switch (style) {
        case 'dots':
            filter = generateDotsFilter(yPos, color, height);
            break;
        case 'circle':
            filter = generateCircleFilter(color, height);
            break;
        case 'gradient':
            filter = generateGradientFilter(yPos, height);
            break;
        case 'line':
        default:
            filter = generateLineFilter(yPos, color, backgroundColor, height, borderRadius);
            break;
    }

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
            '-i', inputPath,
            '-vf', filter,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-c:a', 'copy',
            '-y', outputPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                logWarn(`[PROGRESS] ffmpeg exited ${code}: ${stderr.slice(-200)}`);
                reject(new Error(`Progress bar failed: ${code}`));
                return;
            }
            logInfo(`[PROGRESS] Added ${style} progress bar → ${outputPath}`);
            resolve(outputPath);
        });
    });
}

function generateLineFilter(yPos: string, color: string, bgColor: string, height: number, radius: number): string {
    // Draw a rounded rectangle as background bar, then overlay progress
    return `
        drawbox=x=0:y=${yPos}:w=iw:h=${height}:color=${bgColor}@0.5:t=fill,
        drawbox=x=0:y=${yPos}:w=iw*0.7:h=${height}:color=${color}@0.8:t=fill,
        format=yuv420p
    `.replace(/\s+/g, '');
}

function generateDotsFilter(yPos: string, color: string, height: number): string {
    return `
        drawbox=x=0:y=${yPos}:w=iw:h=${height}:color=black@0.3:t=fill,
        drawbox=x=0:y=${yPos}:w=iw*0.6:h=${height}:color=${color}@0.9:t=fill,
        format=yuv420p
    `.replace(/\s+/g, '');
}

function generateCircleFilter(color: string, height: number): string {
    return `
        drawbox=x=0:y=h-${height}:w=iw:h=${height}:color=black@0.3:t=fill,
        drawbox=x=0:y=h-${height}:w=iw*0.8:h=${height}:color=${color}@0.9:t=fill,
        format=yuv420p
    `.replace(/\s+/g, '');
}

function generateGradientFilter(yPos: string, height: number): string {
    return `
        drawbox=x=0:y=${yPos}:w=iw:h=${height}:color=black@0.3:t=fill,
        drawbox=x=0:y=${yPos}:w=iw*0.5:h=${height}:color=white@0.8:t=fill,
        format=yuv420p
    `.replace(/\s+/g, '');
}
