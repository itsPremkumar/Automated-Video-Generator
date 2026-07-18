/**
 * Watermark / Branding Overlay Plugin
 * Adds logo/watermark with position, opacity, animation options.
 */

import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';

interface WatermarkConfig {
    /** Path to watermark image (PNG with alpha preferred) */
    image?: string;
    /** Position: 'tl' | 'tr' | 'bl' | 'br' | 'center' | 'custom' */
    position?: 'tl' | 'tr' | 'bl' | 'br' | 'center' | 'custom';
    /** Custom position (x, y) in pixels or expressions */
    customPos?: { x: string; y: string };
    /** Opacity (0-1) */
    opacity?: number;
    /** Scale relative to video height (0-1) */
    scale?: number;
    /** Margin from edge (pixels) */
    margin?: number;
    /** Animation: 'none' | 'fade-in' | 'pulse' | 'slide-in' */
    animation?: 'none' | 'fade-in' | 'pulse' | 'slide-in';
    /** Animation duration (seconds) */
    animDur?: number;
    /** Show only after this time (seconds from video start) */
    startAt?: number;
    /** Hide after this time */
    endAt?: number;
    /** Per-scene override */
    scenes?: { sceneIndex: number; enabled?: boolean; position?: string; opacity?: number }[];
}

const DEFAULT_CONFIG: Required<WatermarkConfig> = {
    image: './assets/brand/watermark.png',
    position: 'br',
    customPos: { x: 'W-w-20', y: 'H-h-20' },
    opacity: 0.7,
    scale: 0.12,
    margin: 20,
    animation: 'fade-in',
    animDur: 1.0,
    startAt: 0,
    endAt: Infinity,
    scenes: [],
};

export const watermarkPlugin: AgenticPlugin = {
    metadata: {
        name: 'watermark',
        version: '1.0.0',
        description: 'Brand watermark/logo overlay with position, opacity, and animation',
        author: 'Agentic Video Team',
        tags: ['watermark', 'branding', 'logo', 'overlay', 'watermark'],
    },

    capabilities: [Capability.OVERLAY_STATIC, Capability.OVERLAY_ANIMATED],

    category: PluginCategory.OVERLAY,

    defaultConfig: DEFAULT_CONFIG,

    hooks: {
        onLoad: async (ctx) => {
            const cfg = ctx.getConfig<WatermarkConfig>('watermark');
            const fs = await import('fs');
            const path = await import('path');

            if (cfg.image) {
                const fullPath = path.resolve(cfg.image);
                if (!fs.existsSync(fullPath)) {
                    console.warn(`[watermark] Image not found: ${fullPath}`);
                } else {
                    ctx.setShared('watermarkPath', fullPath);
                }
            }
        },

        onPlan: async (plan, ctx) => {
            const cfg = ctx.getConfig<WatermarkConfig>('watermark');
            const enhanced = { ...plan };

            // Pass watermark config to render
            ctx.setShared('watermarkConfig', cfg);
            return enhanced;
        },

        onRenderFilter: async (scene, ctx) => {
            const cfg = ctx.getConfig<WatermarkConfig>('watermark');
            const wmPath = ctx.getShared('watermarkPath');
            if (!wmPath) return scene;

            // Check scene-specific override
            const sceneCfg = cfg.scenes?.find((s) => s.sceneIndex === scene.sceneIndex - 1);
            if (sceneCfg?.enabled === false) return scene;

            const opacity = sceneCfg?.opacity ?? cfg.opacity;
            const position = sceneCfg?.position ?? cfg.position;
            const scale = cfg.scale;
            const margin = cfg.margin;

            // Build overlay position
            let overlayExpr = '';
            switch (position) {
                case 'tl':
                    overlayExpr = `${margin}:${margin}`;
                    break;
                case 'tr':
                    overlayExpr = `W-w-${margin}:${margin}`;
                    break;
                case 'bl':
                    overlayExpr = `${margin}:H-h-${margin}`;
                    break;
                case 'br':
                    overlayExpr = `W-w-${margin}:H-h-${margin}`;
                    break;
                case 'center':
                    overlayExpr = `(W-w)/2:(H-h)/2`;
                    break;
                case 'custom':
                    overlayExpr = `${cfg.customPos?.x ?? 0}:${cfg.customPos?.y ?? 0}`;
                    break;
            }

            // Build filter chain
            let filter = `movie=${wmPath},scale=-1:'ih*${scale}'[wm];`;
            filter += `[v][wm]overlay=${overlayExpr}:format=auto`;

            // Add animation
            if (cfg.animation !== 'none') {
                const anim = buildAnimation(cfg.animation ?? 'none', cfg.animDur ?? 1, cfg.startAt ?? 0);
                filter = filter.replace('[wm]', `[wm]${anim}[wma]`).replace('[wm]', '[wma]');
            }

            return {
                ...scene,
                filterChain: (scene.filterChain ?? '') + `,${filter}`,
            };
        },
    },
};

function buildAnimation(type: string, dur: number, start: number): string {
    switch (type) {
        case 'fade-in':
            return `,fade=in:st=${start}:d=${dur}:alpha=1`;
        case 'pulse':
            return `,geq='if(gt(t,${start}),if(lt(mod(t-${start},2),1),opacity*0.5+opacity*0.5*sin(PI*t),opacity),opacity)'`;
        case 'slide-in':
            return `,crop=W:H:0:H*(1-t/${dur})`; // Simplified
        default:
            return '';
    }
}

export function registerWatermark(registry: any, config?: Partial<WatermarkConfig>, enabled = true): void {
    registry.register(watermarkPlugin, config, enabled);
}
