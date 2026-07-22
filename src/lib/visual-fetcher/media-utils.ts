import * as fs from 'fs';
import { spawn } from 'child_process';
import { MediaAsset, VideoMetadata } from './types';

export const DEFAULT_RENDER_FPS = 30;
export const SAFE_VIDEO_END_BUFFER_FRAMES = 15;
export const TARGET_VIDEO_DURATION_SECONDS = 6;
export const PREFERRED_QUALITIES = ['hd', 'uhd', 'sd'];
export const MIN_WIDTH = 720;
export const TARGET_RENDER_WIDTH = {
    portrait: 1080,
    landscape: 1920,
    none: 1080,
} as const;

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export const parsePositiveNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? value : undefined;
    }
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }
    return undefined;
};

export const parsePositiveInteger = (value: unknown): number | undefined => {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
    }
    if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }
    return undefined;
};

export const parseFrameRate = (value: unknown): number | undefined => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return undefined;
    }
    if (!value.includes('/')) {
        return parsePositiveNumber(value);
    }
    const [numerator, denominator] = value.split('/');
    const top = parseFloat(numerator);
    const bottom = parseFloat(denominator);
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom === 0) {
        return undefined;
    }
    const rate = top / bottom;
    return Number.isFinite(rate) && rate > 0 ? rate : undefined;
};

export const estimateVideoDurationFromSize = (filePath: string): number | undefined => {
    try {
        const stats = fs.statSync(filePath);
        const sizeMB = stats.size / (1024 * 1024);
        return Math.max(3, Math.min(30, sizeMB * 0.5));
    } catch {
        return undefined;
    }
};

export const calculateSafeTrimAfterFrames = (
    durationSeconds: number,
    renderFps: number = DEFAULT_RENDER_FPS,
): number => {
    const durationFrames = Math.max(1, Math.floor(durationSeconds * renderFps));
    return Math.max(1, durationFrames - SAFE_VIDEO_END_BUFFER_FRAMES);
};

// @ts-ignore - ffprobe-static types
import ffprobePath from 'ffprobe-static';

export async function getVideoMetadata(
    filePath: string,
    renderFps: number = DEFAULT_RENDER_FPS,
): Promise<VideoMetadata> {
    try {
        const ffprobeCmd = typeof ffprobePath === 'string' ? ffprobePath : (ffprobePath as any)?.path || 'ffprobe';
        const timeoutMs = Number(process.env.AGENTIC_FFPROBE_TIMEOUT_MS || 15000);
        const out = await new Promise<string>((resolve, reject) => {
            const child = spawn(
                ffprobeCmd,
                [
                    '-v', 'quiet',
                    '-count_frames',
                    '-print_format', 'json',
                    '-show_entries',
                    'format=duration:stream=codec_type,duration,avg_frame_rate,r_frame_rate,nb_frames,nb_read_frames',
                    filePath,
                ],
                { encoding: 'utf-8' as const, stdio: ['pipe', 'pipe', 'pipe'] } as any,
            );
            let stdout = '';
            let stderr = '';
            const t = setTimeout(() => {
                try { child.kill('SIGKILL'); } catch { /* ignore */ }
                reject(new Error('ffprobe timed out'));
            }, timeoutMs);
            child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
            child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
            child.on('error', (e: Error) => { clearTimeout(t); reject(e); });
            child.on('close', (code: number) => {
                clearTimeout(t);
                if (code !== 0) reject(new Error(stderr?.trim() || 'FFprobe failed'));
                else resolve(stdout);
            });
        });
        const parsed = JSON.parse(out) as {
            format?: { duration?: string };
            streams?: Array<{
                codec_type?: string;
                duration?: string;
                avg_frame_rate?: string;
                r_frame_rate?: string;
                nb_frames?: string;
                nb_read_frames?: string;
            }>;
        };
        const duration = parsePositiveNumber(parsed.format?.duration) ?? estimateVideoDurationFromSize(filePath) ?? 10;
        const videoStream = parsed.streams?.find((s) => s?.codec_type === 'video');
        const frameRate = parseFrameRate(videoStream?.avg_frame_rate) ?? parseFrameRate(videoStream?.r_frame_rate) ?? renderFps;
        // Prefer nb_read_frames (actual frame count), then nb_frames (header), or estimate from duration
        const framesStr = videoStream?.nb_read_frames ?? videoStream?.nb_frames;
        const frameCount = parsePositiveInteger(framesStr) ?? Math.floor(duration * frameRate);
        const trimAfterFrames = Math.max(1, frameCount - SAFE_VIDEO_END_BUFFER_FRAMES);
        return { durationSeconds: duration, trimAfterFrames };
    } catch {
        const fallbackDuration = estimateVideoDurationFromSize(filePath) ?? 10;
        return {
            durationSeconds: fallbackDuration,
            trimAfterFrames: calculateSafeTrimAfterFrames(fallbackDuration, renderFps),
        };
    }
}

export async function getVideoDuration(filePath: string): Promise<number> {
    try {
        const meta = await getVideoMetadata(filePath);
        return meta.durationSeconds;
    } catch {
        return estimateVideoDurationFromSize(filePath) ?? 10;
    }
}

export function getQualityRank(quality: unknown): number {
    const q = String(quality ?? '').toLowerCase().replace(/\s/g, '');
    const idx = PREFERRED_QUALITIES.indexOf(q);
    // Unknown (or empty/undefined) qualities rank worst, behind every preferred one.
    return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

export function selectBestVideoFile(
    assets: MediaAsset[] | undefined | null,
): MediaAsset | null | undefined {
    if (!assets || assets.length === 0) return undefined;
    // Only consider files that meet the minimum width requirement.
    const valid = assets.filter((a) => (a.width ?? 0) >= MIN_WIDTH);
    const pool = valid.length > 0 ? valid : assets;
    // Prefer the best quality rank; break ties by larger width.
    const sorted = [...pool].sort((a, b) => {
        const aq = getQualityRank(a.quality);
        const bq = getQualityRank(b.quality);
        if (aq !== bq) return aq - bq;
        return (b.width ?? 0) - (a.width ?? 0);
    });
    return sorted[0] ?? undefined;
}

export function sortVideoAssets(assets: MediaAsset[]): MediaAsset[] {
    return [...assets].sort((a, b) => {
        // Closest duration to the target first.
        const aDur = a.videoDuration ?? Number.MAX_SAFE_INTEGER;
        const bDur = b.videoDuration ?? Number.MAX_SAFE_INTEGER;
        const aDiff = Math.abs(aDur - TARGET_VIDEO_DURATION_SECONDS);
        const bDiff = Math.abs(bDur - TARGET_VIDEO_DURATION_SECONDS);
        if (aDiff !== bDiff) return aDiff - bDiff;
        // Then larger pixel area.
        const aRes = (a.width ?? 0) * (a.height ?? 0);
        const bRes = (b.width ?? 0) * (b.height ?? 0);
        return bRes - aRes;
    });
}
