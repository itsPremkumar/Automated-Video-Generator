/**
 * batch-variants.ts — Generate multiple video variants and pick the best.
 *
 * Generates N variants of a video with different random seeds,
 * allowing the user to pick the best result.
 *
 * Identity-preserving: all variants are generated in workspace/variants/
 * and the best is copied to the main output.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../shared/logging/runtime-logging.js';

export interface VariantConfig {
    count: number;
    pickBest: boolean;
    autoPick: boolean;
    criteria: 'duration' | 'random' | 'first';
}

export interface VariantResult {
    index: number;
    jobId: string;
    outputPath: string;
    duration: number;
    size: number;
    selected: boolean;
}

const DEFAULT_CONFIG: VariantConfig = {
    count: 3,
    pickBest: false,
    autoPick: false,
    criteria: 'random',
};

/** Generate variant config from environment */
export function getVariantConfig(): VariantConfig {
    return {
        count: Number(process.env.VIDEO_VARIANTS || 3),
        pickBest: process.env.VIDEO_PICK_BEST === 'true',
        autoPick: process.env.VIDEO_AUTO_PICK === 'true',
        criteria: (process.env.VIDEO_PICK_CRITERIA as any) || 'random',
    };
}

/** Check if variant generation is enabled */
export function isVariantsEnabled(): boolean {
    return getVariantConfig().count > 1;
}

/** Generate a random seed for variant */
export function generateSeed(): number {
    return Math.floor(Math.random() * 2147483647);
}

/** Pick the best variant from results */
export function pickBestVariant(results: VariantResult[], criteria: string): VariantResult | null {
    if (results.length === 0) return null;
    if (results.length === 1) return results[0];

    switch (criteria) {
        case 'duration':
            // Pick closest to target duration (if specified)
            return results.reduce((best, curr) => 
                Math.abs(curr.duration - 30) < Math.abs(best.duration - 30) ? curr : best
            );
        case 'first':
            return results[0];
        case 'random':
        default:
            return results[Math.floor(Math.random() * results.length)];
    }
}

/** Get variant output directory */
export function getVariantDir(jobId: string): string {
    return path.resolve(process.cwd(), 'workspace', 'variants', jobId);
}

/** Clean up old variants for a job */
export function cleanupVariants(jobId: string): void {
    const dir = getVariantDir(jobId);
    try {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true });
            logInfo(`[VARIANTS] Cleaned up variants for ${jobId}`);
        }
    } catch (e: any) {
        logWarn(`[VARIANTS] Cleanup failed: ${e?.message ?? e}`);
    }
}

/** Create a manifest of all variants */
export function createVariantManifest(results: VariantResult[], jobId: string): void {
    const manifest = {
        jobId,
        createdAt: Date.now(),
        variants: results,
    };
    const manifestPath = path.join(getVariantDir(jobId), 'variants-manifest.json');
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/** Load variant manifest */
export function loadVariantManifest(jobId: string): any {
    const manifestPath = path.join(getVariantDir(jobId), 'variants-manifest.json');
    try {
        if (fs.existsSync(manifestPath)) {
            return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        }
    } catch (e: any) {
        logWarn(`[VARIANTS] Failed to load manifest: ${e?.message ?? e}`);
    }
    return null;
}
