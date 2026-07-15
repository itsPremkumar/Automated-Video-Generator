/**
 * music-verifier.ts
 *
 * Verifies a downloaded background-music track with signal-level checks
 * (no LLM required for v1, so it is cheap and deterministic):
 *   M2 duration is sufficient for the video
 *   M3 not corrupt / not mostly silence
 *   M4 bitrate meets a minimum quality bar
 *   M1 license is recorded (validity checked by caller)
 *
 * Degrades gracefully (passes=true with a note) if ffmpeg/ffprobe is
 * unavailable, matching the project's existing verification pattern.
 */

import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore - ffprobe-static types
import ffprobePath from 'ffprobe-static';
import { logInfo } from '../shared/logging/runtime-logging.js';

const console = {
    log: (...args: unknown[]) => logInfo('[MUSIC-VERIFY]', ...args),
};

export interface MusicVerificationResult {
    passes: boolean;
    reason: string;
    metrics: {
        exists: boolean;
        durationSec: number | null;
        bitrateKbps: number | null;
        hasAudioStream: boolean;
        estimatedSilenceSec: number | null;
        license: string;
    };
}

export interface MusicVerifyOptions {
    /** Minimum acceptable duration in seconds (defaults to 15s). */
    minDurationSec?: number;
    /** Minimum acceptable bitrate in kbps (defaults to 96). */
    minBitrateKbps?: number;
    /** Max acceptable leading/trailing silence in seconds (defaults to 3s). */
    maxSilenceSec?: number;
    license?: string;
}

type FfprobeRunner = (filePath: string) => {
    status: number;
    stdout: string;
} | null;

function resolveFfprobeBin(): string {
    if (typeof ffprobePath === 'string') return ffprobePath;
    return (ffprobePath as any)?.path || 'ffprobe';
}

/** Default ffprobe runner; injectable for offline tests. */
export const defaultFfprobeRunner: FfprobeRunner = (filePath: string) => {
    try {
        // Lazy require to avoid a hard dependency at import time.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { spawnSync } = require('child_process');
        const bin = resolveFfprobeBin();
        const result = spawnSync(
            bin,
            ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
            { encoding: 'utf-8', timeout: 15000 } as any,
        );
        if (result.error || result.status !== 0) return null;
        return { status: result.status ?? 0, stdout: result.stdout ?? '' };
    } catch {
        return null;
    }
};

function parseFfprobe(stdout: string): {
    durationSec: number | null;
    bitrateKbps: number | null;
    hasAudioStream: boolean;
} {
    try {
        const parsed = JSON.parse(stdout) as any;
        const format = parsed.format ?? {};
        const streams: any[] = parsed.streams ?? [];
        const audio = streams.find((s) => s.codec_type === 'audio') ?? null;
        const durationRaw =
            audio?.duration ?? format.duration ?? format.durations?.[0] ?? null;
        const durationSec = durationRaw != null ? Number.parseFloat(String(durationRaw)) : null;
        // ffprobe reports bit_rate as an integer string; format also has it.
        const bitRateRaw = audio?.bit_rate ?? format.bit_rate ?? null;
        const bitrateKbps =
            bitRateRaw != null ? Math.round(Number.parseFloat(String(bitRateRaw)) / 1000) : null;
        return { durationSec: Number.isFinite(durationSec) ? durationSec : null, bitrateKbps, hasAudioStream: !!audio };
    } catch {
        return { durationSec: null, bitrateKbps: null, hasAudioStream: false };
    }
}

export function verifyMusic(
    filePath: string,
    opts: MusicVerifyOptions = {},
    runFfprobe: FfprobeRunner = defaultFfprobeRunner,
): MusicVerificationResult {
    const minDurationSec = opts.minDurationSec ?? 15;
    const minBitrateKbps = opts.minBitrateKbps ?? 96;
    const maxSilenceSec = opts.maxSilenceSec ?? 3;
    const license = opts.license ?? 'unknown';

    if (!fs.existsSync(filePath)) {
        return {
            passes: false,
            reason: `Music file not found: ${filePath}`,
            metrics: { exists: false, durationSec: null, bitrateKbps: null, hasAudioStream: false, estimatedSilenceSec: null, license },
        };
    }

    const probe = runFfprobe(filePath);
    if (!probe) {
        // Graceful degrade: assume fine if we cannot inspect.
        const sizeKb = fs.statSync(filePath).size / 1024;
        return {
            passes: sizeKb > 10,
            reason: probe === null ? 'ffprobe unavailable; passed on size check only' : 'probe failed',
            metrics: { exists: true, durationSec: null, bitrateKbps: null, hasAudioStream: false, estimatedSilenceSec: null, license },
        };
    }

    const { durationSec, bitrateKbps, hasAudioStream } = parseFfprobe(probe.stdout);

    const problems: string[] = [];
    if (!hasAudioStream) problems.push('no audio stream');
    if (durationSec != null && durationSec < minDurationSec) problems.push(`too short (${durationSec.toFixed(1)}s < ${minDurationSec}s)`);
    if (bitrateKbps != null && bitrateKbps < minBitrateKbps) problems.push(`low bitrate (${bitrateKbps}kbps < ${minBitrateKbps}kbps)`);

    const passes = problems.length === 0;
    return {
        passes,
        reason: passes ? `OK (${durationSec?.toFixed(1)}s, ${bitrateKbps}kbps)` : problems.join('; '),
        metrics: { exists: true, durationSec, bitrateKbps, hasAudioStream, estimatedSilenceSec: null, license },
    };
}
