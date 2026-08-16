/**
 * color-grading/presets.ts — Color grading presets and LUT support.
 *
 * Built-in color presets + support for .cube LUT files.
 * Identity-preserving: all presets are built-in, LUT files optional.
 */

import * as fs from 'fs';
import * as path from 'path';

export type ColorPreset = 'none' | 'cinematic' | 'warm' | 'cool' | 'vintage' | 'noir' | 'vivid' | 'sunset' | 'cyberpunk' | 'muted';

export interface ColorGradeConfig {
    name: string;
    brightness?: number;      // -1.0 to 1.0
    contrast?: number;        // 0.0 to 2.0
    saturation?: number;      // 0.0 to 2.0
    gamma?: number;           // 0.1 to 3.0
    hue?: number;             // -180 to 180
    temperature?: number;     // -100 to 100 (warm/cool)
    tint?: number;            // -100 to 100 (green/magenta)
    vignette?: boolean;
    lutPath?: string;         // path to .cube file
}

export const COLOR_PRESETS: Record<ColorPreset, ColorGradeConfig> = {
    none: { name: 'None' },
    cinematic: {
        name: 'Cinematic',
        contrast: 1.2,
        saturation: 0.9,
        temperature: -10,
        vignette: true,
    },
    warm: {
        name: 'Warm',
        temperature: 30,
        saturation: 1.1,
        brightness: 0.05,
    },
    cool: {
        name: 'Cool',
        temperature: -30,
        saturation: 0.95,
        brightness: -0.05,
    },
    vintage: {
        name: 'Vintage',
        saturation: 0.7,
        contrast: 1.1,
        temperature: 15,
        vignette: true,
    },
    noir: {
        name: 'Noir',
        saturation: 0.0,
        contrast: 1.4,
        brightness: -0.1,
        vignette: true,
    },
    vivid: {
        name: 'Vivid',
        saturation: 1.4,
        contrast: 1.15,
        brightness: 0.05,
    },
    sunset: {
        name: 'Sunset',
        temperature: 40,
        saturation: 1.2,
        contrast: 1.1,
        vignette: true,
    },
    cyberpunk: {
        name: 'Cyberpunk',
        temperature: -20,
        tint: 30,
        saturation: 1.3,
        contrast: 1.2,
    },
    muted: {
        name: 'Muted',
        saturation: 0.6,
        contrast: 0.95,
        brightness: 0.05,
    },
};

/** Get color preset config */
export function getColorPreset(preset: ColorPreset): ColorGradeConfig {
    return COLOR_PRESETS[preset] || COLOR_PRESETS.none;
}

/** List all presets */
export function listColorPresets(): ColorPreset[] {
    return Object.keys(COLOR_PRESETS) as ColorPreset[];
}

/** Generate ffmpeg eq= filter string */
export function generateEqFilter(preset: ColorPreset): string {
    const config = getColorPreset(preset);
    if (preset === 'none') return '';

    const parts: string[] = [];
    if (config.brightness !== undefined) parts.push(`brightness=${config.brightness}`);
    if (config.contrast !== undefined) parts.push(`contrast=${config.contrast}`);
    if (config.saturation !== undefined) parts.push(`saturation=${config.saturation}`);
    if (config.gamma !== undefined) parts.push(`gamma=${config.gamma}`);
    if (config.hue !== undefined) parts.push(`hue=${config.hue}`);

    return parts.length > 0 ? `eq=${parts.join(':')}` : '';
}

/** Generate ffmpeg colorbalance filter for temperature/tint */
export function generateColorBalanceFilter(preset: ColorPreset): string {
    const config = getColorPreset(preset);
    if (preset === 'none') return '';

    const parts: string[] = [];
    if (config.temperature !== undefined) {
        // Warm = more red, cool = more blue
        const temp = config.temperature / 100;
        parts.push(`rs=${temp * 0.1}`);
        parts.push(`bs=${-temp * 0.1}`);
    }
    if (config.tint !== undefined) {
        const tint = config.tint / 100;
        parts.push(`gs=${tint * 0.1}`);
    }

    return parts.length > 0 ? `colorbalance=${parts.join(':')}` : '';
}

/** Generate complete color grading filter chain */
export function generateColorGradeFilter(preset: ColorPreset): string {
    if (preset === 'none') return '';

    const filters: string[] = [];
    const eq = generateEqFilter(preset);
    const cb = generateColorBalanceFilter(preset);

    if (eq) filters.push(eq);
    if (cb) filters.push(cb);

    return filters.join(',');
}

/** Generate vignette filter */
export function generateVignetteFilter(width: number = 1080, height: number = 1920): string {
    return `vignette=PI/4:aspect=${width}/${height}`;
}

/** Check if a LUT file exists */
export function findLutFile(lutName: string): string | null {
    const lutDirs = [
        path.resolve(process.cwd(), 'resource', 'luts'),
        path.resolve(process.cwd(), 'assets', 'luts'),
        path.resolve(process.cwd(), 'workspace', 'luts'),
    ];

    for (const dir of lutDirs) {
        const cubePath = path.join(dir, `${lutName}.cube`);
        if (fs.existsSync(cubePath)) return cubePath;
        const pngPath = path.join(dir, `${lutName}.png`);
        if (fs.existsSync(pngPath)) return pngPath;
    }
    return null;
}

/** Generate LUT filter for ffmpeg */
export function generateLutFilter(lutPath: string): string {
    if (!fs.existsSync(lutPath)) return '';
    return `lut3d=file='${lutPath}'`;
}
