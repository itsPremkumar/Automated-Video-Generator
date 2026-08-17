/**
 * enhance/thumbnail.ts — Auto-generate video thumbnails.
 *
 * Generates eye-catching thumbnails with text overlay.
 * Identity-preserving: ffmpeg-based, no external deps.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../../shared/logging/runtime-logging.js';

export interface ThumbnailOptions {
    videoPath: string;
    outputPath?: string;
    timestamp?: number;        // frame timestamp (default: auto-detect best)
    width?: number;
    height?: number;
    title?: string;
    titleColor?: string;
    titleSize?: number;
    titlePosition?: 'top' | 'center' | 'bottom';
    addOverlay?: boolean;
    overlayColor?: string;
    addBorder?: boolean;
    borderColor?: string;
    borderRadius?: number;
}

const THUMBNAIL_DIR = path.resolve(process.cwd(), 'workspace', 'thumbnails');

/** Generate a thumbnail from video */
export async function generateThumbnail(options: ThumbnailOptions): Promise<string> {
    const {
        videoPath,
        outputPath,
        timestamp,
        width = 1280,
        height = 720,
        title,
        titleColor = 'white',
        titleSize = 64,
        titlePosition = 'bottom',
        addOverlay = true,
        overlayColor = 'black@0.4',
        addBorder = false,
        borderColor = 'white',
    } = options;

    if (!fs.existsSync(videoPath)) {
        throw new Error(`Video not found: ${videoPath}`);
    }

    fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
    const outPath = outputPath || path.join(THUMBNAIL_DIR, `thumb-${Date.now()}.jpg`);

    // If no timestamp specified, use 25% into video (usually most interesting)
    const ts = timestamp !== undefined ? timestamp : await getBestTimestamp(videoPath);

    // Build drawtext filter for title
    let drawtext = '';
    if (title) {
        const x = '(w-text_w)/2';
        const y = titlePosition === 'top' ? '60' : titlePosition === 'center' ? '(h-text_h)/2' : 'h-120';
        drawtext = `,drawtext=text='${title.replace(/'/g, "\\'")}':fontsize=${titleSize}:fontcolor=${titleColor}:bordercolor=black:borderw=3:x=${x}:y=${y}`;
    }

    // Build overlay filter
    let overlay = '';
    if (addOverlay && !title) {
        overlay = `,drawbox=x=0:y=0:w=iw:h=ih:color=${overlayColor}:t=fill`;
    }

    // Build border filter
    let border = '';
    if (addBorder) {
        border = `,drawbox=x=0:y=0:w=iw:h=ih:color=${borderColor}:t=4`;
    }

    const vf = `select=eq(n,0),scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2${drawtext}${overlay}${border}`;

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
            '-ss', String(ts),
            '-i', videoPath,
            '-vf', vf,
            '-frames:v', '1',
            '-q:v', '2',
            '-y', outPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                logWarn(`[THUMBNAIL] ffmpeg exited ${code}: ${stderr.slice(-200)}`);
                reject(new Error(`Thumbnail generation failed: ${code}`));
                return;
            }
            logInfo(`[THUMBNAIL] Generated → ${outPath}`);
            resolve(outPath);
        });
    });
}

/** Generate multiple thumbnail options */
export async function generateThumbnailOptions(
    videoPath: string,
    count: number = 3,
    title?: string,
): Promise<string[]> {
    const duration = await getVideoDuration(videoPath);
    const interval = duration / (count + 1);
    const thumbnails: string[] = [];

    for (let i = 0; i < count; i++) {
        const ts = interval * (i + 1);
        try {
            const thumb = await generateThumbnail({ videoPath, timestamp: ts, title });
            thumbnails.push(thumb);
        } catch (e) {
            logWarn(`[THUMBNAIL] Failed to generate option ${i + 1}`);
        }
    }

    return thumbnails;
}

/** Get best timestamp for thumbnail (avoid black frames) */
async function getBestTimestamp(videoPath: string): Promise<number> {
    try {
        const duration = await getVideoDuration(videoPath);
        // Use 25% into video, or 5 seconds, whichever is less
        return Math.min(duration * 0.25, 5);
    } catch {
        return 1;
    }
}

async function getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve) => {
        const proc = spawn('ffprobe', [
            '-v', 'quiet',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            videoPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stdout = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.on('close', () => resolve(parseFloat(stdout.trim()) || 10));
    });
}

/** Clean up old thumbnails */
export function cleanupThumbnails(maxAgeMs: number = 86400000): void {
    try {
        if (!fs.existsSync(THUMBNAIL_DIR)) return;
        const files = fs.readdirSync(THUMBNAIL_DIR);
        const now = Date.now();
        for (const file of files) {
            const filePath = path.join(THUMBNAIL_DIR, file);
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > maxAgeMs) {
                fs.unlinkSync(filePath);
            }
        }
    } catch (e: any) {
        logWarn(`[THUMBNAIL] Cleanup failed: ${e?.message ?? e}`);
    }
}
