/**
 * preview/live-preview.ts — Live preview endpoint for WebUI.
 *
 * Serves a lightweight preview while video is generating.
 * Identity-preserving: uses existing Remotion preview infrastructure.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { logInfo, logWarn } from '../../../shared/logging/runtime-logging.js';

const PREVIEW_DIR = path.resolve(process.cwd(), 'workspace', 'preview');

/** Generate a preview frame at a specific timestamp */
export async function generatePreviewFrame(
    videoPath: string,
    timestamp: number = 0,
    width: number = 480,
): Promise<string> {
    if (!fs.existsSync(videoPath)) {
        throw new Error(`Video not found: ${videoPath}`);
    }

    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
    const outPath = path.join(PREVIEW_DIR, `preview-${timestamp}-${Date.now()}.jpg`);

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
            '-ss', String(timestamp),
            '-i', videoPath,
            '-frames:v', '1',
            '-q:v', '5',
            '-vf', `scale=${width}:-1`,
            '-y', outPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                logWarn(`[PREVIEW] ffmpeg exited ${code}: ${stderr.slice(-200)}`);
                reject(new Error(`Preview frame generation failed: ${code}`));
                return;
            }
            logInfo(`[PREVIEW] Generated frame at ${timestamp}s → ${outPath}`);
            resolve(outPath);
        });
    });
}

/** Generate multiple preview frames for a video */
export async function generatePreviewStrip(
    videoPath: string,
    numFrames: number = 10,
    width: number = 320,
): Promise<string[]> {
    if (!fs.existsSync(videoPath)) {
        throw new Error(`Video not found: ${videoPath}`);
    }

    // Get video duration first
    const duration = await getVideoDuration(videoPath);
    const interval = duration / (numFrames + 1);

    const frames: string[] = [];
    for (let i = 0; i < numFrames; i++) {
        const timestamp = interval * (i + 1);
        try {
            const frame = await generatePreviewFrame(videoPath, timestamp, width);
            frames.push(frame);
        } catch (e) {
            logWarn(`[PREVIEW] Failed to generate frame at ${timestamp}s`);
        }
    }

    return frames;
}

/** Get video duration in seconds */
export async function getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve) => {
        const proc = spawn('ffprobe', [
            '-v', 'quiet',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            videoPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stdout = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });

        proc.on('close', () => {
            const duration = parseFloat(stdout.trim());
            resolve(isNaN(duration) ? 0 : duration);
        });
    });
}

/** Create a thumbnail grid contact sheet */
export async function createContactSheet(
    videoPath: string,
    cols: number = 4,
    rows: number = 4,
    width: number = 160,
): Promise<string> {
    if (!fs.existsSync(videoPath)) {
        throw new Error(`Video not found: ${videoPath}`);
    }

    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
    const outPath = path.join(PREVIEW_DIR, `contact-${Date.now()}.jpg`);

    const filter = `select=not(mod(n,200)),scale=${width}:-1,tile=${cols}x${rows}`;

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
            '-i', videoPath,
            '-vf', filter,
            '-frames:v', '1',
            '-q:v', '5',
            '-y', outPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                logWarn(`[PREVIEW] contact sheet failed: ${code}`);
                reject(new Error(`Contact sheet failed: ${code}`));
                return;
            }
            resolve(outPath);
        });
    });
}

/** Clean up old preview files */
export function cleanupPreviews(maxAgeMs: number = 3600000): void {
    try {
        if (!fs.existsSync(PREVIEW_DIR)) return;
        const files = fs.readdirSync(PREVIEW_DIR);
        const now = Date.now();
        for (const file of files) {
            const filePath = path.join(PREVIEW_DIR, file);
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > maxAgeMs) {
                fs.unlinkSync(filePath);
            }
        }
    } catch (e: any) {
        logWarn(`[PREVIEW] Cleanup failed: ${e?.message ?? e}`);
    }
}
