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
         
        const mod = require('ffprobe-static');
        return typeof mod === 'string' ? mod : mod.path;
    } catch {
        return 'ffprobe';
    }
}

/** Probe an image or video file for dimensions + (video) duration/aspect.
 *  Async with a hard timeout: a stalled ffprobe/ffmpeg spawn on a RAM-starved
 *  box must not block the whole pipeline (spawnSync can't be interrupted mid-fork). */
export async function probeAsset(filePath: string): Promise<AssetProbe | null> {
    const bin = ffprobeBin();
    const runSpawn = (cmd: string, args: string[]): Promise<string> =>
        new Promise<string>((resolve) => {
            try {
                const { spawn } = require('child_process');
                const timeoutMs = Number(process.env.AGENTIC_FFPROBE_TIMEOUT_MS || 15000);
                const child = spawn(cmd, args, { encoding: 'utf8' as const, stdio: ['pipe', 'pipe', 'pipe'] } as any);
                let out = '';
                let err = '';
                const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } resolve(''); }, timeoutMs);
                child.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
                child.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
                child.on('error', () => { clearTimeout(t); resolve(''); });
                child.on('close', () => { clearTimeout(t); resolve(out + '\n' + err); });
            } catch {
                resolve('');
            }
        });
    let raw = '';
    try {
        raw = await runSpawn(bin, ['-v', 'error', '-show_entries', 'stream=width,height,duration,codec_name,codec_type', '-of', 'default=noprint_wrappers=1', filePath]);
    } catch {
        return null;
    }
    // If bundled ffprobe missing, fall back to ffmpeg -i parsing.
    if (!raw.includes('width=') && !raw.includes('Stream')) {
        const ffmpeg: string = require('ffmpeg-static');
        try {
            raw = await runSpawn(ffmpeg, ['-i', filePath]);
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
export async function checkSourceAsset(
    filePath: string,
    opts: { kind: 'image' | 'video'; minWidth?: number; targetAspect?: number; sceneNeedSec?: number } = { kind: 'image' },
): Promise<SourceCheckResult[]> {
    const minWidth = opts.minWidth ?? 480;
    const results: SourceCheckResult[] = [];
    const probe = await probeAsset(filePath);
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
