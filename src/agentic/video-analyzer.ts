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
 * a tiny ffmpeg/ffprobe pass and parses the textual output — the same approach
 * already proven in gate.ts's verifyRenderedVideo.
 */

import fs from 'fs';

// Mirror gate.ts: import execFileSync untyped so the `{ stderr: 'pipe' }`
// option (which ffmpeg uses to emit detection stats) typechecks.
 
const { execFileSync } = require('child_process');

function ffmpegBin(): string {
     
    return require('ffmpeg-static');
}

export interface BlackFrame { start: number; end: number; duration: number }
export interface FreezeFrame { start: number; end: number; duration: number }
export interface AudioAnalysis {
    peakDb: number;     // max sample peak in dB (from volumedetect)
    meanVolumeDb: number;
    clipping: boolean;  // true peak >= -1.0 dBFS (digital clipping risk)
}

/**
 * Detect fully-black frames. A video with a long black stretch (e.g. a failed
 * scene or a title card that never rendered) is a defect.
 * Returns frames longer than `minDur` seconds; empty = clean.
 */
export function detectBlackFrames(mp4: string, minDur = 0.3): BlackFrame[] {
    // NOTE: only `pix_th` (per-pixel luma threshold) is valid on this ffmpeg
    // build. The legacy `pic_th` option is rejected/mis-parsed and falsely
    // flags the ENTIRE clip as black (black_duration == video length). Using
    // `pix_th=0.15` alone reports real black frames correctly (verified: a
    // valid render yields zero black_start lines).
    const out = runFilter(mppegArgs(mp4, `blackdetect=d=${minDur}:pix_th=0.15`), 'blackdetect');
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
export function detectFreezeFrames(mp4: string, minDur = 0.5): FreezeFrame[] {
    const out = runFilter(mppegArgs(mp4, `freezedetect=n=0.003:d=${minDur}`), 'freezedetect');
    const frames: FreezeFrame[] = [];
    const re = /freeze_start:([\d.]+)\s+freeze_end:([\d.]+)\s+freeze_duration:([\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(out))) {
        frames.push({ start: parseFloat(m[1]), end: parseFloat(m[2]), duration: parseFloat(m[3]) });
    }
    return frames;
}

/** Analyze audio loudness + clipping via ffmpeg volumedetect. */
export function analyzeAudio(mp4: string): AudioAnalysis {
    // volumedetect is an AUDIO filter — must be applied with -filter:a, not -filter:v,
    // otherwise ffmpeg never decodes the audio stream and reports -999 dB.
    const out = runFilter(['-i', mp4, '-filter:a', 'volumedetect', '-f', 'null', '-'], 'volumedetect');
    const peakM = out.match(/max_volume:\s*([-\d.]+)\s*dB/);
    const meanM = out.match(/mean_volume:\s*([-\d.]+)\s*dB/);
    const peakDb = peakM ? parseFloat(peakM[1]) : -999;
    const meanVolumeDb = meanM ? parseFloat(meanM[1]) : -999;
    return { peakDb, meanVolumeDb, clipping: peakDb >= -1.0 };
}

export interface DimCheck { width: number; height: number; codec: string; pixFmt: string; colorRange: string }

/** Probe the rendered video's actual dimensions, codec, pixel format, range. */
export function analyzeDimensions(mp4: string): DimCheck {
     
    const ffprobe = require('ffprobe-static') ? require('ffprobe-static') : null;
    void ffprobe;
    // Use ffprobe if available, else fall back to parsing ffmpeg -i output.
    try {
        const bin = probeBin();
        const raw = execFileSync(bin, ['-v', 'error', '-show_entries', 'stream=width,height,codec_name,pix_fmt,color_range', '-of', 'default=noprint_wrappers=1', mp4]).toString();
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
        let raw = '';
        try { raw = execFileSync(ffmpeg, ['-i', mp4], { stderr: 'pipe' }).toString(); } catch (e: any) { raw = (e.stderr || '').toString(); }
        const dim = (raw.match(/(\d{2,4})x(\d{2,4})/) || []);
        const codec = (raw.match(/Video:\s*(\w+)/) || [])[1] ?? '';
        return { width: parseInt(dim[1] || '0', 10), height: parseInt(dim[2] || '0', 10), codec, pixFmt: 'unknown', colorRange: 'unknown' };
    }
}

function mppegArgs(mp4: string, filter: string): string[] {
    // -t 0 means "read whole file"; we use null muxer to avoid writing output.
    return ['-i', mp4, '-filter:v', filter, '-f', 'null', '-'];
}
function runFilter(args: string[], marker: string): string {
    const ffmpeg = ffmpegBin();
    // spawnSync captures BOTH stdout and stderr. ffmpeg prints detection stats
    // (blackdetect/freezedetect/volumedetect) to stderr, so we must read stderr
    // — execFileSync only returns stdout on success, which is empty for -f null.
    const { spawnSync } = require('child_process');
    const res = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return (res.stdout || '') + '\n' + (res.stderr || '');
}
function probeBin(): string {
    try {
        // ffprobe-static exports { path } not a string.
         
        const mod = require('ffprobe-static');
        return typeof mod === 'string' ? mod : mod.path;
    } catch {
        // ffprobe not bundled: fall back handled by caller via ffmpeg -i.
        throw new Error('no ffprobe');
    }
}

/** Convenience: run the full final-output analysis suite at once. */
export interface OutputAnalysis {
    black: BlackFrame[];
    freeze: FreezeFrame[];
    audio: AudioAnalysis;
    dim: DimCheck;
}
export function analyzeOutput(mp4: string): OutputAnalysis {
    return {
        black: detectBlackFrames(mp4),
        freeze: detectFreezeFrames(mp4),
        audio: analyzeAudio(mp4),
        dim: analyzeDimensions(mp4),
    };
}
