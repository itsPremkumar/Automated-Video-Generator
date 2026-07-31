/**
 * visual-fx.ts — Per-clip / per-scene video effects driven by agentic-scripts.json.
 *
 * Each function is a thin wrapper over ffmpeg filter graphs (ffmpeg-static),
 * so they run with zero external services. All effects are OPTIONAL and only
 * applied to the scene indices a job lists.
 *
 * Supported signals (mapped from cli-job.ts):
 *   clipSpeedByScene  → setpts time-scale (slow-mo / timelapse)
 *   stabilizeScenes   → vidstabdetect + vidstabtransform
 *   chromaKeyScenes   → colorkey green-screen removal
 *   filterByScene      → bw / vintage / sepia color filters
 *   blurScenes         → boxblur background/depth
 *   kenBurns           → zoompan (handled in Remotion layer; here we expose a
 *                        helper that returns the zoompan filter string)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

function ff(): string {
    const p = ffmpegPath as unknown as string;
    if (!p || !fs.existsSync(p)) throw new Error('ffmpeg-static binary not found');
    return p;
}

export interface FxJob {
    clipSpeedByScene?: Record<number, number>;
    stabilizeScenes?: number[];
    chromaKeyScenes?: number[];
    filterByScene?: Record<number, 'bw' | 'vintage' | 'sepia'>;
    blurScenes?: number[];
    /** Ken Burns global toggle (zoom/pan across stills). */
    kenBurns?: boolean;
    /** Optional output frame size for Ken Burns zoompan. Defaults to 1280x720
     *  (landscape) for backward compatibility. Set to portrait dims (e.g.
     *  1080x1920) for vertical/reel output — otherwise zoompan silently forces
     *  landscape 720p and squashes portrait clips. */
    kenBurnsWidth?: number;
    kenBurnsHeight?: number;
    kenBurnsFps?: number;
}

function run(input: string, output: string, filters: string[]): string {
    if (filters.length === 0) return input;
    const p = ff();
    try {
        execFileSync(p, ['-y', '-i', input, '-vf', filters.join(','), '-an', '-c:v', 'libx264', '-preset', 'veryfast', output], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 90000 });
    } catch (e: any) {
        console.warn(`  ⚠ applySceneFx failed (${filters.join(',').slice(0, 60)}…): ${String(e?.stderr ?? e?.message).slice(0, 300)}`);
        return input;
    }
    // Guard: only accept a REAL readable video. A partial/corrupt file
    // (e.g. killed mid-write by the timeout) must not be returned — it
    // would poison every downstream ffmpeg concat/filter stage.
    return isReadableVideoLocal(output) ? output : input;
}

/** Cheap ffprobe check that `p` is a valid, non-empty video. Mirrors
 *  compose.ts isReadableVideo but kept local to avoid an import cycle. */
function isReadableVideoLocal(p: string): boolean {
    if (!p || !fs.existsSync(p) || fs.statSync(p).size === 0) return false;
    try {
        const mod = require('ffprobe-static') as { path?: string };
        const bin = mod?.path;
        if (!bin || !fs.existsSync(bin)) return false;
        const o = execFileSync(bin, ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', p], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).toString();
        return /video/.test(o);
    } catch { return false; }
}

const frameCountCache = new Map<string, number>();
/**
 * Classify the input as a still (true) or real video (false).
 *
 * We deliberately do NOT use ffprobe `-count_frames`: decoding every frame
 * of a 24s 4K clip takes ~70s here, which blows the probe timeout and would
 * misclassify a real video as a still (→ zoompan d=sceneFrames explosion).
 * Instead we inspect the video stream's CODEC — an image (or a .png
 * reclassified to .mp4 by acquire) has codec png/mjpeg; a real clip has
 * h264/h265/av1/vp9/... The probe is metadata-only and instant.
 * Returns true (still) on any probe failure — safer: a still misclassified
 * as video yields a 1-frame zoom (dropped effect), while a video
 * misclassified as still explodes frame count (timeout + corrupt partial).
 */
function isStillSource(p: string): boolean {
    const hit = frameCountCache.get(p);
    if (hit !== undefined) return hit === 1;
    let still = true;
    try {
        const mod = require('ffprobe-static') as { path?: string };
        const bin = mod?.path;
        if (bin && fs.existsSync(bin)) {
            const o = execFileSync(bin, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', p], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).toString();
            const codec = o.trim().split(/\r?\n/)[0] ?? '';
            still = codec === '' || /^(png|mjpeg|bmp|gif|tiff|webp)$/i.test(codec);
        }
    } catch { still = true; }
    frameCountCache.set(p, still ? 1 : 2);
    return still;
}

/** Apply all configured effects for one scene's clip. Returns the (possibly
 *  new) local path. If no effect applies to this scene, returns input unchanged. */
export function applySceneFx(clipPath: string, sceneIndex: number, fx: FxJob, workDir: string): string {
    if (!fs.existsSync(clipPath)) return clipPath;
    const filters: string[] = [];
    const tag: string[] = [];

    const speed = fx.clipSpeedByScene?.[sceneIndex];
    if (speed && speed !== 1) {
        filters.push(`setpts=${1 / speed}*PTS`);
        tag.push(`speed${speed}`);
    }

    // Stabilize: detect pass writes a .trf, then transform is chained below.
    if (fx.stabilizeScenes?.includes(sceneIndex)) {
        const trf = path.join(workDir, `fx_${sceneIndex}_stab.trf`);
        try {
            execFileSync(ff(), ['-y', '-i', clipPath, '-vf', `vidstabdetect=shakiness=5:accuracy=15:result=${trf}`, '-an', '-f', 'null', '-'], { stdio: 'ignore', timeout: 60000 });
        } catch { /* ignore */ }
        if (fs.existsSync(trf)) {
            filters.push(`vidstabtransform=smoothing=30:input=${trf}`);
            tag.push('stab');
        }
    }

    const filt = fx.filterByScene?.[sceneIndex];
    if (filt === 'bw') filters.push('format=gray');
    else if (filt === 'vintage')
        // curves=vintage is a valid ffmpeg filter; saturation must come from
        // eq=, not a bare 'saturation=' (that is not a filter). BUG#4.
        filters.push('curves=vintage,eq=saturation=1.2');
    else if (filt === 'sepia')
        // this ffmpeg-static build ships no 'sepia' filter; emulate with a
        // colorchannelmixer matrix (the canonical sepia approximation). BUG#4.
        filters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
    if (fx.blurScenes?.includes(sceneIndex)) filters.push('boxblur=10');

    if (fx.kenBurns) {
        // Input-aware Ken Burns. zoompan's `d` is the number of OUTPUT frames
        // per INPUT frame, and the correct value depends on the input:
        //  - REAL VIDEO (multi-frame, e.g. a downloaded .mp4 clip): d must be
        //    1 so each input frame maps to exactly one output frame. The old
        //    `d=<sec*fps>` (e.g. d=75) made zoompan emit 75 frames PER input
        //    frame — a 3s/75-frame clip exploded to ~5,600 output frames,
        //    blew the 90s execFileSync timeout, and left a corrupt partial.
        //  - STILL SOURCE (1-frame "video", e.g. a .png reclassified to .mp4
        //    by acquire): d must equal the scene frame count, otherwise the
        //    zoompan output is a single 0.04s frame (effectively dropped).
        // We detect which case we're in with a cheap codec probe.
        const fps = fx.kenBurnsFps ?? 25;
        const isStill = isStillSource(clipPath);
        filters.push(buildKenBurnsFilter(fps, isStill, fx.kenBurnsWidth, fx.kenBurnsHeight));
        tag.push('kb');
    }

    if (filters.length === 0) return clipPath;
    const out = path.join(workDir, `fx_${sceneIndex}_${tag.join('_')}.mp4`);
    return run(clipPath, out, filters);
}

/** Chroma-key (green-screen) removal for a clip. Returns new path. */
export function applyChromaKey(clipPath: string, sceneIndex: number, fx: FxJob, workDir: string): string {
    if (!fx.chromaKeyScenes?.includes(sceneIndex) || !fs.existsSync(clipPath)) return clipPath;
    const out = path.join(workDir, `fx_${sceneIndex}_key.mp4`);
    const res = run(clipPath, out, ['colorkey=green:0.3:0.1']);
    return res;
}

/** Ken Burns zoompan filter string for Remotion/ffmpeg usage.
 *  Dimensions default to 1280x720 (landscape) for backward compatibility.
 *  Pass width/height for portrait or custom output (e.g. 1080x1920 reels) —
 *  otherwise the output is silently forced to landscape 720p. */
export function kenBurnsFilter(zoom = 1.15, durationSec = 5, width = 1280, height = 720, fps = 25): string {
    return `zoompan=z='min(zoom*1.005,${zoom})':d=${Math.round(durationSec * fps)}:s=${width}x${height}:fps=${fps}`;
}

/**
 * Input-aware Ken Burns filter for the ffmpeg compose path.
 *
 * zoompan's `d` is the number of OUTPUT frames per INPUT frame, and the
 * correct value depends on the input kind:
 *  - REAL VIDEO (multi-frame): d=1 — each input frame maps to one output
 *    frame. (d=scene_frames would explode a 75-frame clip to ~5,600 frames,
 *    blow the execFileSync timeout and leave a corrupt partial MP4.)
 *  - STILL SOURCE (1-frame "video", e.g. a .png reclassified to .mp4 by
 *    acquire): d=scene_frames — otherwise the output is a single 0.04s
 *    frame and the zoom never animates.
 * The per-frame zoom step derives from the scene frame count so the full
 * 1.0→1.15 ramp spans the whole clip (smooth Ken Burns) in both cases.
 */
export function buildKenBurnsFilter(
    fps: number,
    isStill: boolean,
    width?: number,
    height?: number,
    zoom = 1.15,
    sceneSec = 3,
): string {
    const frames = Math.max(1, Math.round(sceneSec * fps)); // default 3s per scene
    const step = Math.pow(zoom, 1 / frames); // e.g. 1.00187 at 25fps
    const d = isStill ? frames : 1;
    return `zoompan=z='min(zoom*${step.toFixed(5)},${zoom})':d=${d}:s=${width ?? 1280}x${height ?? 720}:fps=${fps}`;
}
