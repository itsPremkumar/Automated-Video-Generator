/**
 * Platform Export Plugin
 * Handles platform-specific output settings, safe zones, metadata, thumbnails
 */

import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';

interface PlatformConfig {
    /** Target platform */
    platform?:
        | 'tiktok'
        | 'reels'
        | 'shorts'
        | 'youtube'
        | 'instagram'
        | 'linkedin'
        | 'twitter'
        | 'facebook'
        | 'vimeo'
        | 'custom';
    /** Multi-platform export */
    platforms?: string[];
    /** Custom platform specs */
    customSpecs?: Record<string, PlatformSpec>;
    /** Generate thumbnails for each platform */
    thumbnails?: boolean;
    /** Generate metadata files */
    metadata?: boolean;
    /** Apply safe zones */
    safeZones?: boolean;
    /** Output codec */
    codec?: 'h264' | 'hevc' | 'vp9' | 'av1';
    /** Quality preset */
    quality?: 'draft' | 'medium' | 'high' | 'lossless';
}

interface PlatformSpec {
    name: string;
    aspect: '9:16' | '1:1' | '16:9' | '4:5' | '2:3';
    maxDurationSec: number;
    minDurationSec?: number;
    maxFileSizeMB: number;
    codecs: string[];
    frameRate: number;
    bitrate: { video: string; audio: string };
    safeZones: SafeZone[];
    thumbnail: { width: number; height: number; format: 'jpg' | 'png' };
    metadata: Record<string, unknown>;
    upload: { endpoint?: string; apiVersion?: string };
}

interface SafeZone {
    name: string;
    type: 'title' | 'caption' | 'cta' | 'handle' | 'progress' | 'ui';
    position: { x: string; y: string; w: string; h: string }; // CSS-like expressions
    description: string;
}

const PLATFORM_SPECS: Record<string, PlatformSpec> = {
    tiktok: {
        name: 'TikTok',
        aspect: '9:16',
        maxDurationSec: 180,
        maxFileSizeMB: 287,
        codecs: ['h264', 'hevc'],
        frameRate: 30,
        bitrate: { video: '8M', audio: '128k' },
        safeZones: [
            {
                name: 'caption',
                type: 'caption',
                position: { x: '5%', y: '70%', w: '90%', h: '20%' },
                description: 'Bottom caption area',
            },
            {
                name: 'handle',
                type: 'handle',
                position: { x: '5%', y: '5%', w: '30%', h: '8%' },
                description: 'Username/profile',
            },
            {
                name: 'cta',
                type: 'cta',
                position: { x: '5%', y: '85%', w: '90%', h: '10%' },
                description: 'Follow/like buttons',
            },
            {
                name: 'progress',
                type: 'progress',
                position: { x: '0%', y: '96%', w: '100%', h: '4%' },
                description: 'Progress bar',
            },
        ],
        thumbnail: { width: 1080, height: 1920, format: 'jpg' },
        metadata: { platform: 'tiktok', category: 'video' },
        upload: { endpoint: 'https://open-api.tiktok.com/v2/video/upload', apiVersion: 'v2' },
    },

    reels: {
        name: 'Instagram Reels',
        aspect: '9:16',
        maxDurationSec: 90,
        maxFileSizeMB: 4096,
        codecs: ['h264', 'hevc'],
        frameRate: 30,
        bitrate: { video: '10M', audio: '128k' },
        safeZones: [
            {
                name: 'caption',
                type: 'caption',
                position: { x: '5%', y: '72%', w: '90%', h: '18%' },
                description: 'Caption overlay',
            },
            {
                name: 'handle',
                type: 'handle',
                position: { x: '5%', y: '5%', w: '25%', h: '6%' },
                description: 'Profile info',
            },
            {
                name: 'music',
                type: 'cta',
                position: { x: '5%', y: '88%', w: '90%', h: '8%' },
                description: 'Music attribution',
            },
            {
                name: 'ui',
                type: 'ui',
                position: { x: '85%', y: '20%', w: '12%', h: '60%' },
                description: 'Right side UI (like/comment/share)',
            },
        ],
        thumbnail: { width: 1080, height: 1920, format: 'jpg' },
        metadata: { platform: 'instagram', content_type: 'reel' },
        upload: { endpoint: 'https://graph.facebook.com/v18.0/me/media', apiVersion: 'v18.0' },
    },

    shorts: {
        name: 'YouTube Shorts',
        aspect: '9:16',
        maxDurationSec: 60,
        maxFileSizeMB: 2048,
        codecs: ['h264', 'vp9'],
        frameRate: 60,
        bitrate: { video: '12M', audio: '256k' },
        safeZones: [
            {
                name: 'caption',
                type: 'caption',
                position: { x: '5%', y: '75%', w: '90%', h: '15%' },
                description: 'Caption area',
            },
            {
                name: 'subscribe',
                type: 'cta',
                position: { x: '5%', y: '88%', w: '90%', h: '8%' },
                description: 'Subscribe button',
            },
            {
                name: 'progress',
                type: 'progress',
                position: { x: '0%', y: '95%', w: '100%', h: '5%' },
                description: 'Progress indicator',
            },
        ],
        thumbnail: { width: 1280, height: 720, format: 'jpg' },
        metadata: { platform: 'youtube', content_type: 'short' },
        upload: { endpoint: 'https://www.googleapis.com/upload/youtube/v3/videos', apiVersion: 'v3' },
    },

    youtube: {
        name: 'YouTube Standard',
        aspect: '16:9',
        maxDurationSec: 43200, // 12 hours
        maxFileSizeMB: 256000,
        codecs: ['h264', 'hevc', 'vp9', 'av1'],
        frameRate: 60,
        bitrate: { video: '20M', audio: '384k' },
        safeZones: [
            {
                name: 'title',
                type: 'title',
                position: { x: '5%', y: '5%', w: '90%', h: '10%' },
                description: 'Video title overlay',
            },
            {
                name: 'end-screen',
                type: 'cta',
                position: { x: '10%', y: '70%', w: '80%', h: '25%' },
                description: 'End screen elements',
            },
        ],
        thumbnail: { width: 1280, height: 720, format: 'jpg' },
        metadata: { platform: 'youtube', content_type: 'video' },
        upload: { endpoint: 'https://www.googleapis.com/upload/youtube/v3/videos', apiVersion: 'v3' },
    },

    linkedin: {
        name: 'LinkedIn',
        aspect: '16:9',
        maxDurationSec: 600, // 10 min
        maxFileSizeMB: 5120,
        codecs: ['h264', 'hevc'],
        frameRate: 30,
        bitrate: { video: '10M', audio: '128k' },
        safeZones: [
            {
                name: 'caption',
                type: 'caption',
                position: { x: '5%', y: '80%', w: '90%', h: '15%' },
                description: 'Post text overlay',
            },
        ],
        thumbnail: { width: 1280, height: 720, format: 'jpg' },
        metadata: { platform: 'linkedin', content_type: 'video' },
        upload: { endpoint: 'https://api.linkedin.com/v2/videos', apiVersion: 'v2' },
    },

    twitter: {
        name: 'X (Twitter)',
        aspect: '16:9',
        maxDurationSec: 140,
        maxFileSizeMB: 512,
        codecs: ['h264', 'hevc'],
        frameRate: 40,
        bitrate: { video: '8M', audio: '128k' },
        safeZones: [
            {
                name: 'tweet',
                type: 'caption',
                position: { x: '5%', y: '75%', w: '90%', h: '15%' },
                description: 'Tweet text overlay',
            },
        ],
        thumbnail: { width: 1280, height: 720, format: 'jpg' },
        metadata: { platform: 'twitter', content_type: 'video' },
        upload: { endpoint: 'https://upload.twitter.com/1.1/media/upload.json', apiVersion: '1.1' },
    },
};

const DEFAULT_CONFIG: Required<PlatformConfig> = {
    platform: 'youtube',
    platforms: [],
    customSpecs: {},
    thumbnails: true,
    metadata: true,
    safeZones: true,
    codec: 'h264',
    quality: 'high',
};

export const platformExportPlugin: AgenticPlugin = {
    metadata: {
        name: 'platform-export',
        version: '1.0.0',
        description: 'Platform-specific export settings, safe zones, thumbnails, metadata',
        author: 'Agentic Video Team',
        tags: ['export', 'platform', 'tiktok', 'reels', 'shorts', 'youtube', 'metadata', 'thumbnail'],
    },

    capabilities: [
        Capability.PLATFORM_EXPORT,
        Capability.THUMBNAIL_GENERATION,
        Capability.METADATA_GENERATION,
        Capability.SAFE_ZONES,
    ],

    category: PluginCategory.PLATFORM,

    defaultConfig: DEFAULT_CONFIG,

    hooks: {
        onLoad: async (ctx) => {
            const cfg = ctx.getConfig<PlatformConfig>('platform-export');
            // Merge custom specs
            for (const [key, spec] of Object.entries(cfg.customSpecs ?? {})) {
                PLATFORM_SPECS[key] = spec;
            }
        },

        onPlan: async (plan, ctx) => {
            const cfg = ctx.getConfig<PlatformConfig>('platform-export');
            const targetPlatforms =
                (cfg.platforms?.length ?? 0) > 0 ? (cfg.platforms as string[]) : [cfg.platform ?? 'tiktok'];

            const specs = targetPlatforms.map((p) => PLATFORM_SPECS[p as any]).filter(Boolean);
            if (specs.length === 0) return plan;

            // Use first platform as primary for plan adjustments
            const primary = specs[0];
            const enhanced = { ...plan };
            enhanced.aspect = primary.aspect;
            enhanced.metadata = { ...plan.metadata, platformSpecs: specs };

            return enhanced;
        },

        onRender: async (filtergraph, ctx) => {
            const cfg = ctx.getConfig<PlatformConfig>('platform-export');
            const specs = ctx.getShared('platformSpecs') as PlatformSpec[];

            if (!cfg.safeZones || !specs?.length) return filtergraph;

            // Add safe zone visualization (debug) or constraints
            const safeZoneFilters = specs.flatMap((spec) =>
                spec.safeZones.map((zone) => ({
                    id: `safezone-${spec.name}-${zone.name}`,
                    type: 'video' as const,
                    filter: buildSafeZoneOverlay(zone, spec),
                    inputs: [],
                    outputs: [`safezone-${zone.name}`],
                    enabled: true,
                    order: 5000,
                    metadata: {},
                })),
            );

            return {
                ...filtergraph,
                filters: [...filtergraph.filters, ...safeZoneFilters],
            };
        },

        onPostRender: async (outputPath, ctx) => {
            const cfg = ctx.getConfig<PlatformConfig>('platform-export');
            const specs = ctx.getShared('platformSpecs') as PlatformSpec[];
            const plan = ctx.getShared('plan') as any;

            if (!specs?.length) return outputPath;

            const fs = await import('fs');
            const path = await import('path');
            const { execFile } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(execFile);

            const ffmpeg = require('ffmpeg-static');
            const outDir = path.dirname(outputPath);
            const baseName = path.basename(outputPath, path.extname(outputPath));

            // Generate thumbnails for each platform
            if (cfg.thumbnails) {
                for (const spec of specs) {
                    const thumbPath = path.join(
                        outDir,
                        `${baseName}_${spec.name.toLowerCase()}_thumb.${spec.thumbnail.format}`,
                    );
                    await generateThumbnail(ffmpeg, outputPath, thumbPath, spec);
                }
            }

            // Generate metadata files
            if (cfg.metadata) {
                for (const spec of specs) {
                    const metaPath = path.join(outDir, `${baseName}_${spec.name.toLowerCase()}_meta.json`);
                    const metadata = buildMetadata(plan, spec, outputPath);
                    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
                }
            }

            // Transcode for each platform if needed
            const results: string[] = [outputPath];
            for (const spec of specs) {
                if (spec.name.toLowerCase() !== cfg.platform) {
                    const transcodePath = path.join(outDir, `${baseName}_${spec.name.toLowerCase()}.mp4`);
                    await transcodeForPlatform(ffmpeg, outputPath, transcodePath, spec, cfg);
                    results.push(transcodePath);
                }
            }

            return results.join(','); // Return all output paths
        },
    },
};

function buildSafeZoneOverlay(zone: SafeZone, spec: PlatformSpec): string {
    // Draw semi-transparent overlay for safe zone visualization
    const { x, y, w, h } = zone.position;
    return `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=yellow@0.3:t=2`;
}

async function generateThumbnail(ffmpeg: string, input: string, output: string, spec: PlatformSpec): Promise<void> {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(execFile);

    await execAsync(ffmpeg, [
        '-i',
        input,
        '-ss',
        '00:00:01',
        '-vframes',
        '1',
        '-vf',
        `scale=${spec.thumbnail.width}:${spec.thumbnail.height}:force_original_aspect_ratio=decrease,pad=${spec.thumbnail.width}:${spec.thumbnail.height}:(ow-iw)/2:(oh-ih)/2`,
        '-y',
        output,
    ]);
}

function buildMetadata(plan: any, spec: PlatformSpec, videoPath: string): Record<string, unknown> {
    return {
        platform: spec.name,
        video: {
            path: videoPath,
            duration: plan.totalDurationSec,
            aspect: spec.aspect,
            codec: 'h264',
            fps: spec.frameRate,
        },
        content: {
            title: plan.title,
            topic: plan.topic,
            scenes: plan.scenes.map((s: any) => ({
                number: s.sceneNumber,
                text: s.voiceoverText,
                keywords: s.searchKeywords,
                duration: s.durationSec,
            })),
        },
        safeZones: spec.safeZones,
        spec: {
            maxDuration: spec.maxDurationSec,
            maxFileSize: spec.maxFileSizeMB,
            bitrate: spec.bitrate,
        },
        generatedAt: new Date().toISOString(),
    };
}

async function transcodeForPlatform(
    ffmpeg: string,
    input: string,
    output: string,
    spec: PlatformSpec,
    cfg: PlatformConfig,
): Promise<void> {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(execFile);
    const ffmpegPath: string =
        ffmpeg && typeof ffmpeg === 'object' && 'path' in ffmpeg ? (ffmpeg as any).path : String(ffmpeg);

    const qualityMap = {
        draft: '28',
        medium: '23',
        high: '18',
        lossless: '0',
    };

    const crf = qualityMap[cfg.quality ?? 'high'] ?? '18';
    const [vBitrate, aBitrate] = [spec.bitrate.video ?? '0k', spec.bitrate.audio ?? '0k'];

    await execAsync(ffmpegPath, [
        '-i',
        input,
        '-c:v',
        cfg.codec === 'h264' ? 'libx264' : cfg.codec === 'hevc' ? 'libx265' : (cfg.codec ?? 'libx264'),
        '-crf',
        crf,
        '-b:v',
        vBitrate,
        '-maxrate',
        vBitrate,
        '-bufsize',
        `${parseInt(vBitrate) * 2}k`,
        '-c:a',
        'aac',
        '-b:a',
        aBitrate,
        '-r',
        String(spec.frameRate),
        '-vf',
        `scale='if(gt(iw,ih),${spec.aspect === '16:9' ? 1920 : 1080},-2)':'if(gt(iw,ih),-2,${spec.aspect === '16:9' ? 1080 : 1920})':force_original_aspect_ratio=decrease,pad=${spec.aspect === '16:9' ? 1920 : 1080}:${spec.aspect === '16:9' ? 1080 : 1920}:(ow-iw)/2:(oh-ih)/2`,
        '-movflags',
        '+faststart',
        '-y',
        output,
    ]);
}

export function registerPlatformExport(registry: any, config?: Partial<PlatformConfig>, enabled = true): void {
    registry.register(platformExportPlugin, config, enabled);
}

export { PLATFORM_SPECS };
export type { PlatformSpec, SafeZone };
