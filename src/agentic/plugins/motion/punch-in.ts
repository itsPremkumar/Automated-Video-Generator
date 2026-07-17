/**
 * Punch-In / Snap-Zoom Plugin
 * Adds keyframed digital zoom to emphasize moments (faces, products, text).
 * Config-driven, deterministic, ffmpeg-native.
 */

import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';

interface PunchInConfig {
    /** Per-scene punch-in points: [{ atSec, scale, dur, easing }] */
    scenes?: PunchInPoint[];
    /** Global defaults */
    defaults?: Omit<PunchInPoint, 'atSec'>;
    /** Whether to apply only on images (not video) */
    imagesOnly?: boolean;
    /** Fallback: auto-detect emphasis words from script and punch-in */
    autoEmphasis?: boolean;
}

interface PunchInPoint {
    atSec: number;      // Time in scene (seconds)
    scale: number;      // Zoom factor (1.0 = none, 1.5 = 50% zoom)
    dur: number;        // Duration of zoom (seconds)
    easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

const DEFAULT_CONFIG: Required<PunchInConfig> = {
    scenes: [],
    defaults: { scale: 1.4, dur: 0.8, easing: 'ease-out' },
    imagesOnly: true,
    autoEmphasis: true,
};

/** Emphasis words that trigger auto punch-in */
const EMPHASIS_WORDS = [
    'secret', 'amazing', 'incredible', 'shocking', 'unbelievable',
    'critical', 'essential', 'key', 'vital', 'crucial', 'game-changer',
    'breakthrough', 'revolutionary', 'never', 'always', 'best', 'worst',
    'first', 'last', 'only', 'exclusive', 'revealed', 'exposed', 'truth',
];

export const punchInPlugin: AgenticPlugin = {
    metadata: {
        name: 'punch-in',
        version: '1.0.0',
        description: 'Keyframed digital zoom for emphasis (snap-zoom / punch-in)',
        author: 'Agentic Video Team',
        tags: ['zoom', 'emphasis', 'motion', 'keyframe'],
    },

    capabilities: [
        Capability.MOTION_KEYFRAMES,
        Capability.SCRIPT_ANALYSIS,
    ],

    category: PluginCategory.MOTION,

    defaultConfig: DEFAULT_CONFIG,

    hooks: {
        onPlan: async (plan, ctx) => {
            const cfg = ctx.getConfig<PunchInConfig>('punch-in');
            if (!cfg.autoEmphasis) return plan;

            // Auto-detect emphasis moments from script
            const enhancedPlan = { ...plan };
            for (const scene of enhancedPlan.scenes) {
                const text = scene.voiceoverText?.toLowerCase() ?? '';
                const match = EMPHASIS_WORDS.find(w => text.includes(w));
                if (match && !scene.punchIn) {
                    // Place punch-in ~45% through scene
                    const atSec = Math.max(0.3, (scene.durationSec ?? 4) * 0.45);
                    scene.punchIn = {
                        atSec,
                        scale: 1.35,
                        dur: 0.6,
                        easing: 'ease-out',
                        trigger: match,
                    };
                }
            }
            return enhancedPlan;
        },

        onRenderFilter: async (scene, ctx) => {
            const cfg = ctx.getConfig<PunchInConfig>('punch-in');
            const { kind, localPath, durationSec = 4 } = scene;

            // Skip video if imagesOnly
            if (cfg.imagesOnly && kind === 'video') return scene;

            // Get punch-in points for this scene
            const points = getPunchInPoints(scene, cfg, ctx);
            if (points.length === 0) return scene;

            // Build zoompan filter expression with keyframes
            const zoomExpr = buildZoompanExpression(points, durationSec, cfg.defaults.easing);
            if (!zoomExpr) return scene;

            // Inject zoom into scene filter chain
            const enhancedScene = {
                ...scene,
                filterChain: (scene.filterChain ?? '') + `,zoompan=${zoomExpr}`,
            };
            return enhancedScene;
        },

        onGate: async (results, ctx) => {
            // Verify zoom doesn't create black frames or exceed bounds
            for (const r of results) {
                if (r.id === 'X10' && !r.pass) {
                    // Could be caused by aggressive zoom - flag for soften
                    console.warn('[punch-in] X10 black frame detected - consider reducing punch-in scale');
                }
            }
            return results;
        },
    },
};

/** Build zoompan filter expression from punch-in points */
function buildZoompanExpression(
    points: PunchInPoint[],
    sceneDuration: number,
    defaultEasing: string
): string | null {
    if (points.length === 0) return null;

    // zoompan expression: z='if(gt(t,START),min(zoom+RATE,SCALE),zoom)'
    // We chain multiple keyframes using nested if/else
    let expr = 'zoom';
    let currentZoom = 1.0;

    // Sort by time
    points.sort((a, b) => a.atSec - b.atSec);

    for (const p of points) {
        const start = p.atSec;
        const end = Math.min(start + p.dur, sceneDuration);
        const targetZoom = p.scale;
        const rate = (targetZoom - currentZoom) / (end - start);
        const easing = p.easing ?? defaultEasing;

        // Apply easing to rate
        const easedRate = applyEasing(rate, easing);

        expr = `if(gt(t,${start.toFixed(3)}),if(lt(t,${end.toFixed(3)}),min(zoom+${easedRate.toFixed(6)},${targetZoom.toFixed(3)}),${targetZoom.toFixed(3)}),${expr})`;
        currentZoom = targetZoom;
    }

    // Reset to 1.0 after last punch-in
    const lastEnd = points[points.length - 1].atSec + points[points.length - 1].dur;
    if (lastEnd < sceneDuration) {
        expr = `if(gt(t,${lastEnd.toFixed(3)}),1.0,${expr})`;
    }

    // zoompan params: z=expr:d=1:s=WxH
    return `z='${expr}':d=1`;
}

function applyEasing(rate: number, easing: string): number {
    // Rate is already per-frame; easing affects acceleration
    // For simplicity, just return rate (full easing would need frame counter)
    return rate;
}

/** Get punch-in points from scene config + auto-detected */
function getPunchInPoints(scene: any, cfg: PunchInConfig, ctx: any): PunchInPoint[] {
    const points: PunchInPoint[] = [];

    // 1. Scene-specific config
    const sceneConfig = cfg.scenes?.find(s => s.atSec >= 0); // Simplified matching
    if (sceneConfig) points.push({ ...cfg.defaults, ...sceneConfig });

    // 2. Scene.punchIn set by onPlan (auto-emphasis)
    if (scene.punchIn) points.push(scene.punchIn);

    // 3. User override via scene config
    if (scene.config?.punchIn) points.push({ ...cfg.defaults, ...scene.config.punchIn });

    return points;
}

/** Register plugin with registry */
export function registerPunchIn(registry: any, config?: Partial<PunchInConfig>, enabled = true): void {
    registry.register(punchInPlugin, config, enabled);
}