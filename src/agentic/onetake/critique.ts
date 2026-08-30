/**
 * critique.ts — Render-then-critique: ffmpeg QA gates on the rendered MP4.
 *
 * Runs blackdetect, freezedetect, astats RMS, and cropdetect.
 * Returns a structured verdict that the self-fix loop can use to decide
 * whether to retry the render with different parameters.
 */
import { spawnSync } from 'node:child_process';
import * as path from 'path';
import * as fs from 'node:fs';
import { logInfo, logWarn } from '../../shared/logging/runtime-logging.js';
import type { CritiqueVerdict } from './types.js';

const ffmpegBin: string = require('ffmpeg-static');

export interface CritiqueOptions {
    mp4: string;
    expectedDurationSec: number;
    expectedOrientation: 'portrait' | 'landscape' | 'square';
    maxBlackRatio?: number;
    maxFreezeSec?: number;
    minRmsDb?: number;
}

/**
 * Run a ffmpeg filter and return { code, stdout, stderr }.
 */
function runFfmpegFilter(input: string, filter: string, extraArgs: string[] = []): { code: number; stdout: string; stderr: string } {
    const args = ['-hide_banner', '-i', input, '-vf', filter, '-an', '-f', 'null', '-'];
    try {
        const r = spawnSync(ffmpegBin, [...args, ...extraArgs], {
            encoding: 'utf8',
            timeout: 60000,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { code: r.status ?? 1, stdout: (r.stdout ?? '').toString(), stderr: (r.stderr ?? '').toString() };
    } catch (e: any) {
        return { code: 1, stdout: '', stderr: e?.message ?? String(e) };
    }
}

/**
 * Parse blackdetect output: count black frames + measure total black ratio.
 */
function parseBlackdetect(stderr: string): { frames: number; ratio: number } {
    const matches = stderr.match(/black_start:\S+ black_end:\S+ black_duration:\S+/g) ?? [];
    return { frames: matches.length, ratio: matches.length > 0 ? Math.min(matches.length / 100, 1) : 0 };
}

/**
 * Parse freezedetect output: find longest freeze.
 */
function parseFreezedetect(stderr: string): { longestSec: number } {
    const matches = stderr.match(/freeze_duration:\s*(\d+\.?\d*)/g) ?? [];
    const durations = matches.map(m => parseFloat(m.split(':')[1].trim()));
    return { longestSec: durations.length > 0 ? Math.max(...durations) : 0 };
}

/**
 * Parse astats output: find RMS level in dB.
 */
function parseAstats(stderr: string): { rmsDb: number | null } {
    const match = stderr.match(/RMS level dB:\s*(-?\d+\.?\d*)/);
    return { rmsDb: match ? parseFloat(match[1]) : null };
}

/**
 * Parse cropdetect output: get dominant crop.
 */
function parseCropdetect(stderr: string): { crop: string } {
    const matches = stderr.match(/crop=\d+:\d+:\d+:\d+/g) ?? [];
    if (matches.length === 0) return { crop: '' };
    // Most common crop value
    const freq = new Map<string, number>();
    for (const m of matches) freq.set(m, (freq.get(m) ?? 0) + 1);
    return { crop: [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0] };
}

/**
 * Run the full critique suite on a rendered MP4.
 * Returns a CritiqueVerdict with per-gate pass/fail + suggested fix.
 */
export function critiqueRender(opts: CritiqueOptions): CritiqueVerdict {
    const { mp4 } = opts;
    const gates: CritiqueVerdict['gates'] = [];

    if (!fs.existsSync(mp4)) {
        return {
            passed: false,
            gates: [{ id: 'exists', label: 'MP4 exists', pass: false, detail: `File not found: ${mp4}` }],
            fixAction: 're-render',
        };
    }

    const maxBlack = opts.maxBlackRatio ?? 0.10;
    const maxFreeze = opts.maxFreezeSec ?? 2.0;
    const minRms = opts.minRmsDb ?? -50;

    // 1) Black detect
    logInfo(`[ONETATE] Running blackdetect on ${path.basename(mp4)}`);
    const black = runFfmpegFilter(mp4, 'blackdetect=d=0.1:pix_th=0.05');
    const blackResult = parseBlackdetect(black.stderr);
    const blackOk = blackResult.ratio < maxBlack;
    gates.push({
        id: 'blackdetect',
        label: 'No excessive black frames',
        pass: blackOk,
        detail: `${blackResult.frames} black frames detected, ratio=${(blackResult.ratio * 100).toFixed(1)}% (max ${(maxBlack * 100).toFixed(0)}%)`,
    });

    // 2) Freeze detect
    logInfo(`[ONETAKE] Running freezedetect on ${path.basename(mp4)}`);
    const freeze = runFfmpegFilter(mp4, 'freezedetect=n=0.003:d=2');
    const freezeResult = parseFreezedetect(freeze.stderr);
    const freezeOk = freezeResult.longestSec < maxFreeze;
    gates.push({
        id: 'freezedetect',
        label: 'No freeze frames',
        pass: freezeOk,
        detail: `Longest freeze: ${freezeResult.longestSec.toFixed(2)}s (max ${maxFreeze}s)`,
    });

    // 3) Audio RMS
    logInfo(`[ONETAKE] Running astats on ${path.basename(mp4)}`);
    const audio = runFfmpegFilter(mp4, 'astats=metadata=1:reset=1');
    const audioResult = parseAstats(audio.stderr);
    const audioOk = audioResult.rmsDb === null || audioResult.rmsDb > minRms;
    gates.push({
        id: 'astats',
        label: 'Audio present (not silent)',
        pass: audioOk,
        detail: audioResult.rmsDb !== null ? `RMS: ${audioResult.rmsDb.toFixed(2)} dBFS (min ${minRms})` : 'No audio stream (acceptable for audioless)',
    });

    // 4) Crop detect (orientation sanity)
    logInfo(`[ONETAKE] Running cropdetect on ${path.basename(mp4)}`);
    const crop = runFfmpegFilter(mp4, 'cropdetect=24:16:0');
    const cropResult = parseCropdetect(crop.stderr);
    const dims = cropResult.crop.match(/crop=(\d+):(\d+)/);
    let cropOk = true;
    if (dims) {
        const w = parseInt(dims[1]);
        const h = parseInt(dims[2]);
        if (opts.expectedOrientation === 'portrait') cropOk = h >= w;
        else if (opts.expectedOrientation === 'landscape') cropOk = w >= h;
    }
    gates.push({
        id: 'cropdetect',
        label: 'Correct aspect ratio',
        pass: cropOk,
        detail: cropResult.crop ? `Detected ${cropResult.crop}` : 'Could not detect crop',
    });

    // Determine suggested fix action
    let fixAction: CritiqueVerdict['fixAction'] = 'none';
    if (!blackOk) fixAction = 're-render';
    else if (!freezeOk) fixAction = 're-render';
    else if (!audioOk) fixAction = 're-render';
    else if (!cropOk) fixAction = 're-grade';

    const passed = gates.every(g => g.pass);
    logInfo(`[ONETAKE] Critique ${passed ? 'PASS' : 'FAIL'} — ${gates.filter(g => !g.pass).length} gates failed`);

    return { passed, gates, fixAction };
}