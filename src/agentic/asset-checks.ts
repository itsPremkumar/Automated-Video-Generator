/**
 * asset-checks.ts — STAGE-3 SOURCE-ASSET checks that the verification matrix
 * was missing: minimum resolution, aspect-ratio match, duplicate detection,
 * and video duration/aspect fit. These run BEFORE render so a 240p upscale or a
 * reused image is caught early instead of wasting a render + post-check cycle.
 *
 * All checks are deterministic and offline (ffprobe + sha256), no AI keys.
 * Each checker returns a small result the gate/decision layer can consume.
 */

import fs from 'fs';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { spawnSync } = require('child_process');

export interface AssetProbe {
    width: number;
    height: number;
    durationSec: number;   // 0 for images
    aspect: number;        // width/height
    codec?: string;
}

function ffprobeBin(): string {
    try {
        // ffprobe-static exports { path } not a string.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('ffprobe-static');
        return typeof mod === 'string' ? mod : mod.path;
    } catch {
        return 'ffprobe';
    }
}

/** Probe an image or video file for dimensions + (video) duration/aspect. */
export function probeAsset(filePath: string): AssetProbe | null {
    let bin = ffprobeBin();
    let raw = '';
    try {
        const res = spawnSync(bin, ['-v', 'error', '-show_entries', 'stream=width,height,duration,codec_name,codec_type', '-of', 'default=noprint_wrappers=1', filePath], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        raw = (res.stdout || '') + '\n' + (res.stderr || '');
    } catch {
        return null;
    }
    // If bundled ffprobe missing, fall back to ffmpeg -i parsing.
    if (!raw.includes('width=') && !raw.includes('Stream')) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ffmpeg: string = require('ffmpeg-static');
        try {
            const r = spawnSync(ffmpeg, ['-i', filePath], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            raw = (r.stdout || '') + '\n' + (r.stderr || '');
        } catch { return null; }
    }
    const wM = raw.match(/width\s*=\s*(\d+)/);
    const hM = raw.match(/height\s*=\s*(\d+)/);
    const width = wM ? parseInt(wM[1], 10) : 0;
    const height = hM ? parseInt(hM[1], 10) : 0;
    const durM = raw.match(/duration=([\d.]+)/) || raw.match(/Duration:\s*([\d:.]+)/);
    let durationSec = 0;
    if (durM) {
        const p = durM[1].split(':');
        durationSec = p.length === 3 ? p.reduce((a: number, x: string) => a * 60 + parseFloat(x), 0) : parseFloat(durM[1]);
    }
    const codec = (raw.match(/codec_name=(\w+)/) || raw.match(/Video:\s*(\w+)/) || [])[1] ?? undefined;
    return { width, height, durationSec, aspect: height ? width / height : 0, codec };
}

/** Stable hash of first 256KB — cheap duplicate detection across candidates. */
export function fileHash(filePath: string): string {
    const buf = Buffer.alloc(256 * 1024);
    const fd = fs.openSync(filePath, 'r');
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    return crypto.createHash('sha256').update(buf.subarray(0, n)).digest('hex');
}

export interface SourceCheckResult {
    id: string;
    label: string;
    pass: boolean;
    detail: string;
}

/**
 * Run the missing STAGE-3 source checks on one asset.
 * @param minWidth minimum acceptable width (I4). Default 480 (a 240p asset fails).
 * @param targetAspect expected w/h (e.g. 9/16=0.5625 portrait). Aspect mismatch >15% fails (I5/V6).
 * @param minDurationSec for video, minimum usable length vs scene need (V4).
 */
export function checkSourceAsset(
    filePath: string,
    opts: { kind: 'image' | 'video'; minWidth?: number; targetAspect?: number; sceneNeedSec?: number } = { kind: 'image' },
): SourceCheckResult[] {
    const minWidth = opts.minWidth ?? 480;
    const results: SourceCheckResult[] = [];
    const probe = probeAsset(filePath);
    if (!probe || probe.width === 0) {
        results.push({ id: opts.kind === 'image' ? 'I0' : 'V0', label: 'Asset probeable', pass: false, detail: 'could not read dimensions' });
        return results;
    }
    if (opts.kind === 'image') {
        const ok = probe.width >= minWidth;
        results.push({ id: 'I4', label: 'Min image resolution', pass: ok, detail: `${probe.width}x${probe.height}${ok ? '' : ` (<${minWidth}px)`}` });
        if (opts.targetAspect) {
            const a = probe.aspect;
            const okA = Math.abs(a - opts.targetAspect) / opts.targetAspect <= 0.15;
            results.push({ id: 'I5', label: 'Aspect ratio match', pass: okA, detail: `asset ${a.toFixed(3)} vs target ${opts.targetAspect.toFixed(3)}` });
        }
    } else {
        const ok = probe.width >= minWidth;
        results.push({ id: 'V5', label: 'Min video resolution', pass: ok, detail: `${probe.width}x${probe.height}${ok ? '' : ` (<${minWidth}px)`}` });
        if (opts.targetAspect) {
            const a = probe.aspect;
            const okA = Math.abs(a - opts.targetAspect) / opts.targetAspect <= 0.15;
            results.push({ id: 'V6', label: 'Video aspect match', pass: okA, detail: `asset ${a.toFixed(3)} vs target ${opts.targetAspect.toFixed(3)}` });
        }
        if (opts.sceneNeedSec && probe.durationSec > 0) {
            const okD = probe.durationSec >= opts.sceneNeedSec * 0.5;
            results.push({ id: 'V4', label: 'Video duration fit', pass: okD, detail: `${probe.durationSec.toFixed(1)}s for ${opts.sceneNeedSec}s scene` });
        }
    }
    return results;
}

/** Detect duplicate assets by comparing content hashes (I7). */
export function findDuplicates(paths: string[]): string[][] {
    const byHash = new Map<string, string[]>();
    for (const p of paths) {
        try { const h = fileHash(p); if (!byHash.has(h)) byHash.set(h, []); byHash.get(h)!.push(p); } catch { /* skip unreadable */ }
    }
    return [...byHash.values()].filter((g) => g.length > 1);
}
