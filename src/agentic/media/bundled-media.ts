/**
 * bundled-media.ts — offline fallback media registry.
 *
 * PRODUCTION GUARANTEE: when every network source fails (rate-limit,
 * offline, Pexels key missing), the pipeline MUST still produce a video.
 * This module provides a small set of bundled, CC0-cleared media assets
 * that ship with the package — no network required.
 *
 * Assets live under assets/bundled/ (git-tracked, tiny footprint):
 *   images/  — 3 solid-color gradient JPGs (KenBurns makes them move)
 *   videos/  — 3 short color-field MP4s (loopable B-roll)
 *   music/   — 2 short ambient CC0 audio beds
 *
 * Total budget: <500KB so the install stays lean. The renderer treats
 * these as ordinary local files; no other code path changes.
 */

import * as fs from 'fs';
import * as path from 'path';

const BUNDLED_DIR = path.join(__dirname, '..', '..', '..', 'assets', 'bundled');

export interface BundledAsset {
    path: string;
    width: number;
    height: number;
    durationSec?: number;
}

function exists(p: string): boolean {
    try { return fs.existsSync(p); } catch { return false; }
}

/** Bundled gradient images (KenBurns animates them). */
export function bundledImages(): BundledAsset[] {
    const dir = path.join(BUNDLED_DIR, 'images');
    if (!exists(dir)) return [];
    const out: BundledAsset[] = [];
    for (const f of fs.readdirSync(dir)) {
        if (/\.(jpg|jpeg|png|webp)$/i.test(f)) {
            out.push({ path: path.join(dir, f), width: 1920, height: 1080 });
        }
    }
    return out;
}

/** Bundled video clips (loopable B-roll). */
export function bundledVideos(): BundledAsset[] {
    const dir = path.join(BUNDLED_DIR, 'videos');
    if (!exists(dir)) return [];
    const out: BundledAsset[] = [];
    for (const f of fs.readdirSync(dir)) {
        if (/\.(mp4|webm|mov|m4v)$/i.test(f)) {
            out.push({ path: path.join(dir, f), width: 1920, height: 1080, durationSec: 10 });
        }
    }
    return out;
}

/** Bundled music beds (CC0 ambient). */
export function bundledMusic(): BundledAsset[] {
    const dir = path.join(BUNDLED_DIR, 'music');
    if (!exists(dir)) return [];
    const out: BundledAsset[] = [];
    for (const f of fs.readdirSync(dir)) {
        if (/\.(mp3|wav|ogg|flac|m4a)$/i.test(f)) {
            out.push({ path: path.join(dir, f), width: 0, height: 0, durationSec: 60 });
        }
    }
    return out;
}

/** True if any bundled assets exist (offline mode available). */
export function hasBundledAssets(): boolean {
    return bundledImages().length > 0 || bundledVideos().length > 0;
}

/** Alias for hasBundledAssets — true if offline mode is available. */
export function isOfflineModeAvailable(): boolean {
    return hasBundledAssets();
}

/** Human-readable status for diagnostics. */
export function bundledStatus(): { images: number; videos: number; music: number } {
    return {
        images: bundledImages().length,
        videos: bundledVideos().length,
        music: bundledMusic().length,
    };
}
