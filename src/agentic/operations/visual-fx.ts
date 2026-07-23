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
    return fs.existsSync(output) && fs.statSync(output).size > 0 ? output : input;
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
    else if (filt === 'vintage') filters.push('curves=vintage,saturation=1.2');
    else if (filt === 'sepia') filters.push('sepia=0.8');
    if (fx.blurScenes?.includes(sceneIndex)) filters.push('boxblur=10');

    if (fx.kenBurns) {
        filters.push(kenBurnsFilter(1.15, 3, fx.kenBurnsWidth, fx.kenBurnsHeight, fx.kenBurnsFps));
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
