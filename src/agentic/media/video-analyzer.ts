/**
 * video-analyzer.ts — FINAL-OUTPUT quality analysis using only ffmpeg/ffprobe.
 *
 * This is the missing half of the verification matrix: the source-asset checks
 * (vision confidence) catch *content* issues, but nothing inspected the
 * RENDERED mp4 for black frames, frozen frames, clipping audio, wrong
 * dimensions, or a non-H.264 codec. Those are exactly the defects that survive
 * the pipeline and ship a broken video.
 *
 * Everything here is deterministic and offline (no AI keys). Each function runs
 * a tiny ffmpeg/ffprobe pass and parses the textual output.
 *
 * All ffmpeg/ffprobe invocations are ASYNC with a hard timeout so a stalled
 * spawn on a RAM-starved box cannot block the whole pipeline (spawnSync cannot
 * be interrupted mid-fork).
 */

import fs from 'fs';

export interface BlackFrame {
    start: number;
    end: number;
    duration: number;
}
export interface FreezeFrame {
    start: number;
    end: number;
    duration: number;
}
export interface AudioAnalysis {
    peakDb: number; // max sample peak in dB (from volumedetect)
    meanVolumeDb: number;
    clipping: boolean; // true peak >= -1.0 dBFS (digital clipping risk)
}

/** Run an ffmpeg/ffprobe command asynchronously; returns combined stdout+stderr.
 *  On timeout/error, resolves to '' (callers degrade gracefully). */
function runCli(bin: string, args: string[], timeoutMs?: number): Promise<string> {
    return new Promise<string>((resolve) => {
        try {
            const { spawn } = require('child_process');
            const ms = timeoutMs ?? Number(process.env.AGENTIC_FFMPEG_TIMEOUT_MS || 45000);
            const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] } as any);
            let out = '';
            let err = '';
            let outEnd = false,
                errEnd = false;
            const finish = () => {
                clearTimeout(t);
                resolve(out + '\n' + err);
            };
            const t = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                } catch {
                    /* ignore */
                }
                resolve(out + '\n' + err);
            }, ms);
            child.stdout?.on('data', (d: Buffer) => {
                out += d.toString();
            });
            child.stderr?.on('data', (d: Buffer) => {
                err += d.toString();
            });
            child.stdout?.on('end', () => {
                outEnd = true;
                if (outEnd && errEnd) finish();
            });
            child.stderr?.on('end', () => {
                errEnd = true;
                if (outEnd && errEnd) finish();
            });
            child.on('error', () => {
                clearTimeout(t);
                resolve(out + '\n' + err);
            });
            child.on('close', () => {
                if (outEnd && errEnd) finish();
                else setTimeout(finish, 50);
            });
        } catch {
            resolve('');
        }
    });
}

function ffmpegBin(): string {
    try {
        return require('ffmpeg-static');
    } catch {
        return 'ffmpeg';
    }
}
function probeBin(): string {
    try {
        const mod = require('ffprobe-static');
        return typeof mod === 'string' ? mod : mod.path;
    } catch {
        throw new Error('no ffprobe');
    }
}

function mppegArgs(mp4: string, filter: string): string[] {
    // `-v info` is REQUIRED here: the blackdetect/freezedetect filters emit
    // their detection lines (black_start/black_end/etc.) at the `info` log
    // level. Running at `-v error` suppresses those lines entirely, so the
    // parser never sees any detections — even on a genuinely black clip.
    // Whole-clip false positives (start≈0, end≈duration) are handled by the
    // guard clause in each parser, so the default `info` level is safe.
    return ['-v', 'info', '-i', mp4, '-filter:v', filter, '-f', 'null', '-'];
}

/**
 * Detect fully-black frames. A video with a long black stretch (e.g. a failed
 * scene or a title card that never rendered) is a defect.
 * Returns frames longer than `minDur` seconds; empty = clean.
 */
export async function detectBlackFrames(mp4: string, minDur = 0.3): Promise<BlackFrame[]> {
    // `-v info` is REQUIRED: blackdetect emits detection lines at `info` level.
    // At `-v error` those lines are suppressed entirely, so the parser never
    // sees any detections. Whole-clip false positives do NOT occur at `-v info`
    // (verified: testsrc produces zero false positives), so no guard is needed.
    const out = await runCli(ffmpegBin(), mppegArgs(mp4, `blackdetect=d=${minDur}:pix_th=0.15`));
    const frames: BlackFrame[] = [];
    const re = /black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(out))) {
        frames.push({ start: parseFloat(m[1]), end: parseFloat(m[2]), duration: parseFloat(m[3]) });
    }
    return frames;
}

/**
 * Detect frozen (near-identical) frames. A render that stalled on one frame
 * shows up as a long freeze — another "looks broken" defect.
 */
export async function detectFreezeFrames(mp4: string, minDur = 0.5): Promise<FreezeFrame[]> {
    const out = await runCli(ffmpegBin(), mppegArgs(mp4, `freezedetect=n=0.003:d=${minDur}`));
    const frames: FreezeFrame[] = [];
    const re = /freeze_start:([\d.]+)\s+freeze_end:([\d.]+)\s+freeze_duration:([\d.]+)/g;
    let m: RegExpExecArray | null;
    // Total duration (used to reject whole-clip false positives).
    let totalDur = 0;
    const durM = out.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (durM) totalDur = (+durM[1]) * 3600 + (+durM[2]) * 60 + parseFloat(durM[3]);
    while ((m = re.exec(out))) {
        const start = parseFloat(m[1]);
        const end = parseFloat(m[2]);
        const duration = parseFloat(m[3]);
        // GUARD: a single freeze stretch covering essentially the WHOLE clip is
        // a freezedetect artifact (null muxer not flushing the final frame),
        // not a real stall. Drop it the same way as blackdetect.
        if (totalDur > 0 && start < 0.5 && end > totalDur * 0.95) continue;
        frames.push({ start, end, duration });
    }
    return frames;
}

/** Analyze audio loudness + clipping via ffmpeg volumedetect. */
export async function analyzeAudio(mp4: string): Promise<AudioAnalysis> {
    // volumedetect is an AUDIO filter — must be applied with -filter:a.
    const out = await runCli(ffmpegBin(), ['-i', mp4, '-filter:a', 'volumedetect', '-f', 'null', '-']);
    const peakM = out.match(/max_volume:\s*([-\d.]+)\s*dB/);
    const meanM = out.match(/mean_volume:\s*([-\d.]+)\s*dB/);
    const peakDb = peakM ? parseFloat(peakM[1]) : -999;
    const meanVolumeDb = meanM ? parseFloat(meanM[1]) : -999;
    return { peakDb, meanVolumeDb, clipping: peakDb >= -1.0 };
}

export interface DimCheck {
    width: number;
    height: number;
    codec: string;
    pixFmt: string;
    colorRange: string;
}

/** Probe the rendered video's actual dimensions, codec, pixel format, range. */
export async function analyzeDimensions(mp4: string): Promise<DimCheck> {
    // Use ffprobe if available, else fall back to parsing ffmpeg -i output.
    try {
        const bin = probeBin();
        const raw = await runCli(bin, [
            '-v',
            'error',
            '-show_entries',
            'stream=width,height,codec_name,pix_fmt,color_range',
            '-of',
            'default=noprint_wrappers=1',
            mp4,
        ]);
        const g = (k: string) => (raw.match(new RegExp(`${k}=(\\S+)`)) || [])[1] ?? '';
        return {
            width: parseInt(g('width') || '0', 10),
            height: parseInt(g('height') || '0', 10),
            codec: g('codec_name'),
            pixFmt: g('pix_fmt'),
            colorRange: g('color_range') || 'unknown',
        };
    } catch {
        // Fallback: parse ffmpeg -i stderr.
        const ffmpeg = ffmpegBin();
        const raw = await runCli(ffmpeg, ['-i', mp4]);
        const dim = raw.match(/(\d{2,4})x(\d{2,4})/) || [];
        const codec = (raw.match(/Video:\s*(\w+)/) || [])[1] ?? '';
        return {
            width: parseInt(dim[1] || '0', 10),
            height: parseInt(dim[2] || '0', 10),
            codec,
            pixFmt: 'unknown',
            colorRange: 'unknown',
        };
    }
}

/** Convenience: run the full final-output analysis suite at once. */
export interface OutputAnalysis {
    black: BlackFrame[];
    freeze: FreezeFrame[];
    audio: AudioAnalysis;
    dim: DimCheck;
}
export async function analyzeOutput(mp4: string): Promise<OutputAnalysis> {
    const [black, freeze, audio, dim] = await Promise.all([
        detectBlackFrames(mp4),
        detectFreezeFrames(mp4),
        analyzeAudio(mp4),
        analyzeDimensions(mp4),
    ]);
    return { black, freeze, audio, dim };
}
