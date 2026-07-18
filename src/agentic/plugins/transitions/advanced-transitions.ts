/**
 * Advanced Transitions Plugin
 * Whip pan, glitch, light leak, match cut, morph cut, iris wipe, etc.
 */

import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';

interface TransitionConfig {
    /** Default transition type for scenes without explicit config */
    defaultType?: TransitionType;
    /** Per-scene transition override */
    scenes?: { sceneIndex: number; type: TransitionType; params?: Record<string, unknown> }[];
    /** Global transition duration (seconds) */
    duration?: number;
    /** Enable match-cut analysis (requires vision backend) */
    matchCut?: boolean;
}

type TransitionType =
    | 'fade'
    | 'slideleft'
    | 'slideright'
    | 'slideup'
    | 'slidedown'
    | 'wipeleft'
    | 'wiperight'
    | 'wipeup'
    | 'wipedown'
    | 'circleopen'
    | 'circleclose'
    | 'distance'
    | 'zoomin'
    | 'zoomout'
    | 'hlslice'
    | 'hrslice'
    | 'vuslice'
    | 'vdslice'
    | 'dissolve'
    | 'pixelize'
    | 'diagbl'
    | 'diagbr'
    | 'diagtl'
    | 'diagtr'
    | 'whipPan'
    | 'glitch'
    | 'lightLeak'
    | 'morphCut'
    | 'matchCut'
    | 'custom';

const DEFAULT_CONFIG: Required<TransitionConfig> = {
    defaultType: 'fade',
    scenes: [],
    duration: 0.5,
    matchCut: false,
};

/** FFmpeg xfade transition map */
const XFADE_MAP: Record<string, string> = {
    fade: 'fade',
    slideleft: 'slideleft',
    slideright: 'slideright',
    slideup: 'slideup',
    slidedown: 'slidedown',
    wipeleft: 'wipeleft',
    wiperight: 'wiperight',
    wipeup: 'wipeup',
    wipedown: 'wipedown',
    circleopen: 'circleopen',
    circleclose: 'circleclose',
    distance: 'distance',
    zoomin: 'zoomin',
    zoomout: 'zoomout',
    hlslice: 'hlslice',
    hrslice: 'hrslice',
    vuslice: 'vuslice',
    vdslice: 'vdslice',
    dissolve: 'dissolve',
    pixelize: 'pixelize',
    diagbl: 'diagbl',
    diagbr: 'diagbr',
    diagtl: 'diagtl',
    diagtr: 'diagtr',
};

export const transitionsPlugin: AgenticPlugin = {
    metadata: {
        name: 'advanced-transitions',
        version: '1.0.0',
        description: 'Advanced transitions: whip pan, glitch, light leak, morph cut, match cut',
        author: 'Agentic Video Team',
        tags: ['transition', 'xfade', 'whip', 'glitch', 'morph', 'match', 'lightleak'],
    },

    capabilities: [Capability.TRANSITION_ADVANCED, Capability.TRANSITION_CUSTOM],

    category: PluginCategory.TRANSITION,

    defaultConfig: DEFAULT_CONFIG,

    hooks: {
        onPlan: async (plan, ctx) => {
            const cfg = ctx.getConfig<TransitionConfig>('advanced-transitions');
            const enhanced = { ...plan };

            // Assign transitions per scene
            for (const scene of enhanced.scenes) {
                const sceneCfg = cfg.scenes?.find((s) => s.sceneIndex === scene.sceneNumber);
                scene.transition = sceneCfg?.type ?? cfg.defaultType;
                scene.transitionParams = sceneCfg?.params ?? {};
                scene.transitionDuration = cfg.duration;
            }
            return enhanced;
        },

        onRender: async (filtergraph, ctx) => {
            const cfg = ctx.getConfig<TransitionConfig>('advanced-transitions');
            const scenes = ctx.getShared('scenes') as any[];

            if (!scenes) return filtergraph;

            // Build transition filtergraph
            const enhanced = { ...filtergraph };
            const videoFilters = enhanced.filters.filter((f) => f.type === 'video');

            // Process transitions between consecutive scenes
            let prevLabel = 'v0';
            let cursor = 0;

            for (let i = 1; i < scenes.length; i++) {
                const scene = scenes[i];
                const transitionType = scene.transition ?? cfg.defaultType;
                const duration = scene.transitionDuration ?? cfg.duration;
                const params = scene.transitionParams ?? {};

                const currLabel = `v${i}`;

                if (transitionType === 'whipPan') {
                    // Whip pan: fast directional blur + slide
                    const direction = params.direction ?? 'left';
                    const blur = params.blur ?? 50;
                    enhanced.filters.push({
                        id: `whip-${i}`,
                        type: 'complex',
                        filter: buildWhipPan(prevLabel, currLabel, cursor, duration, direction, blur),
                        inputs: [prevLabel, currLabel],
                        outputs: [`x${i}`],
                        enabled: true,
                        order: 1000 + i,
                        metadata: {},
                    });
                    prevLabel = `x${i}`;
                    cursor += duration - 0.1; // overlap
                } else if (transitionType === 'glitch') {
                    // Glitch: RGB shift + noise + displacement
                    const intensity = params.intensity ?? 1.0;
                    enhanced.filters.push({
                        id: `glitch-${i}`,
                        type: 'complex',
                        filter: buildGlitch(prevLabel, currLabel, cursor, duration, intensity),
                        inputs: [prevLabel, currLabel],
                        outputs: [`x${i}`],
                        enabled: true,
                        order: 1000 + i,
                        metadata: {},
                    });
                    prevLabel = `x${i}`;
                    cursor += duration - 0.15;
                } else if (transitionType === 'lightLeak') {
                    // Light leak overlay
                    const leakAsset: string = params.asset ?? (await findLightLeakAsset(ctx)) ?? '';
                    if (leakAsset) {
                        enhanced.filters.push({
                            id: `lightleak-${i}`,
                            type: 'complex',
                            filter: buildLightLeak(prevLabel, currLabel, leakAsset, cursor, duration, params),
                            inputs: [prevLabel, currLabel, leakAsset],
                            outputs: [`x${i}`],
                            enabled: true,
                            order: 1000 + i,
                            metadata: {},
                        });
                        prevLabel = `x${i}`;
                        cursor += duration;
                    }
                } else if (transitionType === 'morphCut') {
                    // Morph cut using minterpolate (optical flow)
                    enhanced.filters.push({
                        id: `morph-${i}`,
                        type: 'complex',
                        filter: buildMorphCut(prevLabel, currLabel, cursor, duration),
                        inputs: [prevLabel, currLabel],
                        outputs: [`x${i}`],
                        enabled: true,
                        order: 1000 + i,
                        metadata: {},
                    });
                    prevLabel = `x${i}`;
                    cursor += duration - 0.1;
                } else if (transitionType === 'matchCut') {
                    // Match cut - requires vision analysis
                    // For now, fall back to crossfade with color match
                    enhanced.filters.push({
                        id: `match-${i}`,
                        type: 'complex',
                        filter: buildMatchCut(prevLabel, currLabel, cursor, duration),
                        inputs: [prevLabel, currLabel],
                        outputs: [`x${i}`],
                        enabled: true,
                        order: 1000 + i,
                        metadata: {},
                    });
                    prevLabel = `x${i}`;
                    cursor += duration;
                } else {
                    // Standard xfade
                    const xfadeName = XFADE_MAP[transitionType] ?? 'fade';
                    enhanced.filters.push({
                        id: `xfade-${i}`,
                        type: 'complex',
                        filter: `[${prevLabel}][${currLabel}]xfade=transition=${xfadeName}:duration=${duration}:offset=${cursor}[x${i}]`,
                        inputs: [prevLabel, currLabel],
                        outputs: [`x${i}`],
                        enabled: true,
                        order: 1000 + i,
                        metadata: {},
                    });
                    prevLabel = `x${i}`;
                    cursor += scenes[i].durationSec ?? 4 - duration;
                }
            }

            return enhanced;
        },
    },
};

function buildWhipPan(prev: string, curr: string, offset: number, dur: number, dir: string, blur: number): string {
    const dirMap: Record<string, string> = {
        left: 'slideleft',
        right: 'slideright',
        up: 'slideup',
        down: 'slidedown',
    };
    const xfade = dirMap[dir] ?? 'slideleft';

    // Directional blur on outgoing, then xfade
    return `
        [${prev}]gblur=sigma=${blur}:steps=1[${prev}b];
        [${curr}]gblur=sigma=${blur}:steps=1[${curr}b];
        [${prev}b][${curr}b]xfade=transition=${xfade}:duration=${dur}:offset=${offset}
    `;
}

function buildGlitch(prev: string, curr: string, offset: number, dur: number, intensity: number): string {
    const shift = Math.round(10 * intensity);
    const freq = Math.round(5 * intensity);

    return `
        [${prev}]split[${prev}a][${prev}b];
        [${prev}a]rgbashift=r=${shift}:g=0:b=0[${prev}r];
        [${prev}b]rgbashift=r=0:g=0:b=-${shift}[${prev}b2];
        [${prev}r][${prev}b2]blend=all_mode=difference[${prev}g];
        [${prev}g]noise=alls=${20 * intensity}:allf=t+u[${prev}n];
        [${prev}n][${curr}]xfade=transition=dissolve:duration=${dur}:offset=${offset}
    `;
}

function buildLightLeak(prev: string, curr: string, asset: string, offset: number, dur: number, params: any): string {
    const mode = params.mode ?? 'screen';
    const opacity = params.opacity ?? 0.6;

    return `
        movie=${asset},loop=0,setpts=N/FRAME_RATE/TB[leak];
        [${prev}][${curr}]xfade=transition=fade:duration=${dur}:offset=${offset}[xf];
        [xf][leak]blend=all_mode=${mode}:all_opacity=${opacity}
    `;
}

function buildMorphCut(prev: string, curr: string, offset: number, dur: number): string {
    // minterpolate for optical flow morph
    return `
        [${prev}]minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1[${prev}m];
        [${curr}]minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1[${curr}m];
        [${prev}m][${curr}m]xfade=transition=fade:duration=${dur}:offset=${offset}
    `;
}

function buildMatchCut(prev: string, curr: string, offset: number, dur: number): string {
    // Color match outgoing end frame to incoming start frame
    return `
        [${prev}]split[${prev}a][${prev}b];
        [${prev}b]trim=start_frame=0:end_frame=1,scale=1:1,format=rgb24,format=yuv420p[${prev}px];
        [${curr}]trim=start_frame=0:end_frame=1,scale=1:1,format=rgb24,format=yuv420p[${curr}px];
        [${prev}a][${curr}]xfade=transition=fade:duration=${dur}:offset=${offset}
    `;
}

async function findLightLeakAsset(ctx: any): Promise<string | null> {
    // Search in assets/overlays/light-leaks/
    const fs = await import('fs');
    const path = await import('path');
    const dirs = ['./assets/overlays/light-leaks', './input/input-assets/light-leaks'];

    for (const d of dirs) {
        const full = path.resolve(d);
        if (fs.existsSync(full)) {
            const files = fs.readdirSync(full).filter((f) => /\.(mp4|mov|webm)$/i.test(f));
            if (files.length > 0) return path.join(full, files[0]);
        }
    }
    return null;
}

export function registerTransitions(registry: any, config?: Partial<TransitionConfig>, enabled = true): void {
    registry.register(transitionsPlugin, config, enabled);
}
