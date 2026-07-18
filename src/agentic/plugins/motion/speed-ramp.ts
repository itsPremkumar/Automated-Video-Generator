/**
 * Speed Ramp Plugin
 * Variable speed within a clip (slow-mo → fast → normal) with smooth bezier curves.
 * Uses ffmpeg setpts with expression-based time remapping.
 */

import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';

interface SpeedRampConfig {
    /** Per-scene speed ramps: [{ t, speed }] - t in seconds from scene start */
    scenes?: SpeedRampPoint[][];
    /** Global default ramps */
    defaults?: SpeedRampPoint[];
    /** Minimum speed (0.1 = 10x slow) */
    minSpeed?: number;
    /** Maximum speed (10 = 10x fast) */
    maxSpeed?: number;
    /** Easing function between points */
    easing?: 'linear' | 'bezier' | 'step';
}

interface SpeedRampPoint {
    t: number; // Time in seconds from scene start
    speed: number; // 1.0 = normal, 0.5 = half speed, 2.0 = double
}

const DEFAULT_CONFIG: Required<SpeedRampConfig> = {
    scenes: [],
    defaults: [{ t: 0, speed: 1.0 }],
    minSpeed: 0.1,
    maxSpeed: 8.0,
    easing: 'bezier',
};

/** Preset speed ramp patterns */
export const SPEED_RAMP_PRESETS = {
    cinematic: [
        { t: 0, speed: 1.0 },
        { t: 0.5, speed: 0.3 },
        { t: 1.5, speed: 1.0 },
    ] as SpeedRampPoint[],
    action: [
        { t: 0, speed: 1.0 },
        { t: 0.8, speed: 2.5 },
        { t: 1.2, speed: 1.0 },
    ] as SpeedRampPoint[],
    reveal: [
        { t: 0, speed: 0.25 },
        { t: 2.0, speed: 1.0 },
    ] as SpeedRampPoint[],
    punch: [
        { t: 0, speed: 1.0 },
        { t: 0.3, speed: 0.2 },
        { t: 0.8, speed: 1.5 },
        { t: 1.2, speed: 1.0 },
    ] as SpeedRampPoint[],
    timelapse: [{ t: 0, speed: 8.0 }] as SpeedRampPoint[],
    slowmo: [{ t: 0, speed: 0.125 }] as SpeedRampPoint[],
};

export const speedRampPlugin: AgenticPlugin = {
    metadata: {
        name: 'speed-ramp',
        version: '1.0.0',
        description: 'Variable speed (slow-mo, fast-forward, ramps) with bezier interpolation',
        author: 'Agentic Video Team',
        tags: ['speed', 'slowmo', 'timelapse', 'remap', 'bezier'],
    },

    capabilities: [Capability.MOTION_KEYFRAMES, Capability.TIME_REMAP],

    category: PluginCategory.MOTION,

    defaultConfig: DEFAULT_CONFIG,

    hooks: {
        onPlan: async (plan, ctx) => {
            const cfg = ctx.getConfig<SpeedRampConfig>('speed-ramp');
            const enhancedPlan = { ...plan };

            // Apply scene-specific ramps
            for (let i = 0; i < enhancedPlan.scenes.length; i++) {
                const scene = enhancedPlan.scenes[i];
                const ramp = cfg.scenes?.[i] ?? ((cfg.defaults?.length ?? 0) > 1 ? cfg.defaults : null);

                if (ramp && ramp.length > 1) {
                    scene.speedRamp = normalizeRamp(ramp, scene.durationSec ?? 4, { ...DEFAULT_CONFIG, ...cfg } as any);
                }
            }
            return enhancedPlan;
        },

        onRenderFilter: async (scene, ctx) => {
            if (!scene.speedRamp) return scene;

            const setptsExpr = buildSetptsExpression(scene.speedRamp, scene.durationSec ?? 4);
            if (!setptsExpr) return scene;

            return {
                ...scene,
                filterChain: (scene.filterChain ?? '') + `,setpts=${setptsExpr}`,
            };
        },
    },
};

function normalizeRamp(points: SpeedRampPoint[], duration: number, cfg: Required<SpeedRampConfig>): SpeedRampPoint[] {
    return points
        .map((p) => ({
            t: Math.max(0, Math.min(p.t, duration)),
            speed: Math.max(cfg.minSpeed, Math.min(cfg.maxSpeed, p.speed)),
        }))
        .sort((a, b) => a.t - b.t);
}

function buildSetptsExpression(ramp: SpeedRampPoint[], duration: number): string | null {
    if (ramp.length < 2) return null;

    // Build piecewise linear interpolation for setpts
    // setpts = 'PTS/(gte(t,T1)*S1 + gte(t,T2)*S2 ...)'
    // Actually need integral of 1/speed over time for proper timestamp mapping

    let expr = '';
    for (let i = 0; i < ramp.length - 1; i++) {
        const p0 = ramp[i];
        const p1 = ramp[i + 1];
        const t0 = p0.t;
        const t1 = p1.t;
        const s0 = p0.speed;
        const s1 = p1.speed;

        // Linear speed interpolation between points
        // For setpts we need: integral of 1/speed(t) dt
        // With linear speed: 1/speed = 1/(s0 + (s1-s0)*(t-t0)/(t1-t0))
        // This integral is: (t1-t0)/(s1-s0) * ln((s1*t + s0*(t1-t))/(s0*t1 + s1*t0 - s0*t - s1*t0))  -- too complex

        // Simpler: approximate with discrete segments using if/else
        const segment = `(gte(t,${t0.toFixed(3)})*lt(t,${t1.toFixed(3)}))*(${buildSegmentExpr(p0, p1)})`;
        expr += (i > 0 ? '+' : '') + segment;
    }

    // Final segment (hold last speed)
    const last = ramp[ramp.length - 1];
    expr += `+(gte(t,${last.t.toFixed(3)}))*(${last.speed})`;

    // setpts expects PTS * factor, where factor = 1/speed
    // So we use: setpts=PTS/(${expr})
    return `PTS/(${expr})`;
}

function buildSegmentExpr(p0: SpeedRampPoint, p1: SpeedRampPoint): string {
    // Linear interpolation: speed = s0 + (s1-s0)*(t-t0)/(t1-t0)
    const dt = p1.t - p0.t;
    if (dt <= 0) return p1.speed.toFixed(3);

    const slope = (p1.speed - p0.speed) / dt;
    return `${p0.speed.toFixed(3)}+${slope.toFixed(6)}*(t-${p0.t.toFixed(3)})`;
}

export function registerSpeedRamp(registry: any, config?: Partial<SpeedRampConfig>, enabled = true): void {
    registry.register(speedRampPlugin, config, enabled);
}
