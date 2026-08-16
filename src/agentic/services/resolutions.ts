/**
 * resolutions.ts — Video resolution presets.
 *
 * Supports multiple resolutions including:
 * - 9:16 Portrait (1080x1920) - TikTok/Shorts/Reels
 * - 16:9 Landscape (1920x1080) - YouTube
 * - 1:1 Square (1080x1080) - Instagram
 * - 4K Portrait (2160x3840) - High-quality mobile
 * - 4K Landscape (3840x2160) - High-quality desktop
 * - 720p (1280x720) - Fast rendering
 */

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:3' | '3:4';

export interface Resolution {
    name: string;
    width: number;
    height: number;
    aspectRatio: string;
    description: string;
    fps?: number;
}

export const RESOLUTIONS: Record<string, Resolution> = {
    // Portrait (mobile)
    'portrait_1080': {
        name: 'Portrait 1080p',
        width: 1080,
        height: 1920,
        aspectRatio: '9:16',
        description: 'TikTok, YouTube Shorts, Instagram Reels',
        fps: 30,
    },
    'portrait_4k': {
        name: 'Portrait 4K',
        width: 2160,
        height: 3840,
        aspectRatio: '9:16',
        description: 'High-quality mobile video',
        fps: 30,
    },
    'portrait_720': {
        name: 'Portrait 720p',
        width: 720,
        height: 1280,
        aspectRatio: '9:16',
        description: 'Fast rendering, smaller file',
        fps: 30,
    },

    // Landscape (desktop)
    'landscape_1080': {
        name: 'Landscape 1080p',
        width: 1920,
        height: 1080,
        aspectRatio: '16:9',
        description: 'YouTube, standard HD',
        fps: 30,
    },
    'landscape_4k': {
        name: 'Landscape 4K',
        width: 3840,
        height: 2160,
        aspectRatio: '16:9',
        description: 'High-quality desktop video',
        fps: 30,
    },
    'landscape_720': {
        name: 'Landscape 720p',
        width: 1280,
        height: 720,
        aspectRatio: '16:9',
        description: 'Fast rendering, smaller file',
        fps: 30,
    },

    // Square
    'square_1080': {
        name: 'Square 1080p',
        width: 1080,
        height: 1080,
        aspectRatio: '1:1',
        description: 'Instagram feed, social media',
        fps: 30,
    },

    // 4:3 (presentation)
    'presentation_1080': {
        name: 'Presentation 1080p',
        width: 1920,
        height: 1440,
        aspectRatio: '4:3',
        description: 'Presentations, slides',
        fps: 30,
    },
};

/** Get resolution by key */
export function getResolution(key: string): Resolution {
    return RESOLUTIONS[key] || RESOLUTIONS['portrait_1080'];
}

/** Get all resolutions matching an aspect ratio */
export function getResolutionsByAspect(ratio: AspectRatio): Resolution[] {
    return Object.values(RESOLUTIONS).filter(r => r.aspectRatio === ratio);
}

/** Get resolution from dimensions */
export function getResolutionFromDims(width: number, height: number): Resolution | null {
    return Object.values(RESOLUTIONS).find(r => r.width === width && r.height === height) || null;
}

/** List all resolution keys */
export function listResolutions(): string[] {
    return Object.keys(RESOLUTIONS);
}

/** Get default resolution */
export function getDefaultResolution(): Resolution {
    return RESOLUTIONS['portrait_1080'];
}

/** Parse resolution string like "1920x1080" */
export function parseResolution(str: string): Resolution | null {
    const match = str.match(/^(\d+)x(\d+)$/);
    if (!match) return null;
    const width = parseInt(match[1]);
    const height = parseInt(match[2]);
    return getResolutionFromDims(width, height);
}

/** Get ffmpeg scale filter string */
export function getScaleFilter(resolution: Resolution): string {
    return `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2`;
}

/** Calculate estimated file size (MB) for a video */
export function estimateFileSize(resolution: Resolution, durationSec: number, bitrateMbps: number = 8): number {
    return (bitrateMbps * durationSec) / 8;
}
