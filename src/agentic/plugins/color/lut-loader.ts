/**
 * LUT Loader Plugin
 * Loads .cube/.3dl LUT files and applies them via ffmpeg lut3d filter.
 * Supports creative LUTs, log->rec709, film emulation.
 */

import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';

interface LUTConfig {
    /** Directory containing .cube/.3dl files */
    lutDir?: string;
    /** Per-scene LUT assignment */
    scenes?: { sceneIndex: number; lut: string; intensity?: number }[];
    /** Default LUT for all scenes */
    defaultLUT?: string;
    /** Blend intensity (0-1) */
    intensity?: number;
    /** Color space conversion before LUT */
    inputSpace?: 'rec709' | 'log' | 'srgb' | 'auto';
    /** Color space after LUT */
    outputSpace?: 'rec709' | 'p3' | 'rec2020' | 'auto';
}

const DEFAULT_CONFIG: Required<LUTConfig> = {
    lutDir: './assets/luts',
    scenes: [],
    defaultLUT: '',
    intensity: 1.0,
    inputSpace: 'auto',
    outputSpace: 'auto',
};

/** Built-in LUT presets (names only - files must exist in lutDir) */
export const LUT_PRESETS = {
    // Film emulation
    fuji400h: 'fuji-400h.cube',
    kodak2383: 'kodak-2383.cube',
    kodak5219: 'kodak-5219.cube',
    portra400: 'portra-400.cube',
    ektar100: 'ektar-100.cube',

    // Cinematic
    tealOrange: 'teal-orange.cube',
    bleachBypass: 'bleach-bypass.cube',
    crossProcess: 'cross-process.cube',
    noir: 'noir.cube',

    // Log conversions
    slog3ToRec709: 'slog3-to-rec709.cube',
    logCToRec709: 'logc-to-rec709.cube',
    vlogToRec709: 'vlog-to-rec709.cube',
    redLogToRec709: 'redlog-to-rec709.cube',

    // Creative
    cinematic: 'cinematic.cube',
    vintage: 'vintage.cube',
    cyberpunk: 'cyberpunk.cube',
    warm: 'warm.cube',
    cool: 'cool.cube',
};

export const lutLoaderPlugin: AgenticPlugin = {
    metadata: {
        name: 'lut-loader',
        version: '1.0.0',
        description: 'Load and apply 3D LUTs (.cube/.3dl) for color grading',
        author: 'Agentic Video Team',
        tags: ['lut', 'color', 'grading', 'film', 'log', 'cube'],
    },

    capabilities: [
        Capability.COLOR_GRADING,
        Capability.LUT_SUPPORT,
    ],

    category: PluginCategory.COLOR,

    defaultConfig: DEFAULT_CONFIG,

    hooks: {
        onLoad: async (ctx) => {
            const cfg = ctx.getConfig<LUTConfig>('lut-loader');
            // Verify LUT directory exists
            const fs = await import('fs');
            const path = await import('path');
            const lutDir = path.resolve(cfg.lutDir ?? '');
            if (!fs.existsSync(lutDir)) {
                console.warn(`[lut-loader] LUT directory not found: ${lutDir}`);
            } else {
                const files = fs.readdirSync(lutDir).filter(f => f.endsWith('.cube') || f.endsWith('.3dl'));
                console.log(`[lut-loader] Found ${files.length} LUT files:`, files);
            }
        },

        onPlan: async (plan, ctx) => {
            const cfg = ctx.getConfig<LUTConfig>('lut-loader');
            const enhanced = { ...plan };

            // Assign LUTs per scene
            for (const scene of enhanced.scenes) {
                const sceneCfg = cfg.scenes?.find(s => s.sceneIndex === scene.sceneNumber - 1);
                if (sceneCfg) {
                    scene.lut = sceneCfg.lut;
                    scene.lutIntensity = sceneCfg.intensity ?? cfg.intensity;
                } else if (cfg.defaultLUT) {
                    scene.lut = cfg.defaultLUT;
                    scene.lutIntensity = cfg.intensity;
                }
            }
            return enhanced;
        },

        onRenderFilter: async (scene, ctx) => {
            if (!scene.lut) return scene;

            const cfg = ctx.getConfig<LUTConfig>('lut-loader');
            const lutPath = await resolveLUTPath(scene.lut, cfg, ctx);
            if (!lutPath) return scene;

            const intensity = scene.lutIntensity ?? cfg.intensity ?? 1.0;
            let lutFilter = `lut3d='${lutPath}'`;

            // Add blend if intensity < 1.0
            if (intensity < 1.0) {
                // lut3d doesn't support mix directly, need blend with original
                lutFilter = `split[orig][lut];[lut]${lutFilter}[lutted];[orig][lutted]blend=all_mode=normal:all_opacity=${intensity}`;
            }

            return {
                ...scene,
                filterChain: (scene.filterChain ?? '') + `,${lutFilter}`,
            };
        },
    },
};

async function resolveLUTPath(lutName: string, cfg: LUTConfig, ctx: any): Promise<string | null> {
    const path = await import('path');
    const fs = await import('fs');

    // If already a full path
    if (lutName.includes('/') || lutName.includes('\\')) {
        return fs.existsSync(lutName) ? lutName : null;
    }

    // Check in lutDir
    const lutDir = path.resolve(cfg.lutDir ?? '');
    const candidates = [
        path.join(lutDir, lutName),
        path.join(lutDir, lutName + '.cube'),
        path.join(lutDir, lutName + '.3dl'),
    ];

    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }

    // Check in preset map
    const preset = LUT_PRESETS[lutName as keyof typeof LUT_PRESETS];
    if (preset) {
        for (const c of candidates.map(c => path.join(lutDir, preset))) {
            if (fs.existsSync(c)) return c;
        }
    }

    console.warn(`[lut-loader] LUT not found: ${lutName}`);
    return null;
}

export function registerLUTLoader(registry: any, config?: Partial<LUTConfig>, enabled = true): void {
    registry.register(lutLoaderPlugin, config, enabled);
}