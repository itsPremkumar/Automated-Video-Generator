/**
 * proxy.ts — ADVANCED: instant draft proxies + content-addressed segment cache.
 *
 * - resolveProxyDims: 480p-equivalent dims preserving aspect (fast preview).
 * - segmentKey: stable hash of (scene text + visual path + motion + grade)
 *   so unchanged scenes hit cache across revisions.
 * - proxyFfmpegArgs: scale+fps+crf preset for sub-second-per-scene drafts.
 */

import { createHash } from 'crypto';

export function resolveProxyDims(width: number, height: number): { w: number; h: number } {
    const ar = width / height;
    if (ar < 0.7) return { w: 360, h: 640 }; // 9:16
    if (ar > 1.3) return { w: 640, h: 360 }; // 16:9
    if (Math.abs(ar - 1) < 0.1) return { w: 480, h: 480 };
    return { w: 480, h: Math.round(480 / ar) };
}

export function segmentKey(parts: Record<string, unknown>): string {
    const s = JSON.stringify(parts, Object.keys(parts).sort());
    return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

export function proxyFfmpegArgs(): string[] {
    return ['-preset', 'ultrafast', '-crf', '30', '-r', '15'];
}

export function finalFfmpegArgs(quality: 'low' | 'medium' | 'high' | 'lossless' = 'high'): string[] {
    if (quality === 'low') return ['-preset', 'veryfast', '-crf', '26'];
    if (quality === 'medium') return ['-preset', 'medium', '-crf', '22'];
    if (quality === 'lossless') return ['-preset', 'medium', '-crf', '14'];
    return ['-preset', 'medium', '-crf', '19'];
}
