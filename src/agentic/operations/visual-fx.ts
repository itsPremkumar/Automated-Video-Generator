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
}

function run(input: string, output: string, filters: string[]): string {
    if (filters.length === 0) return input;
    const p = ff();
    try {
        execFileSync(p, ['-y', '-i', input, '-vf', filters.join(','), '-an', '-c:v', 'libx264', '-preset', 'veryfast', output], { stdio: 'ignore', timeout: 90000 });
    } catch (e) {
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
    if (fx.stabilizeScenes?.includes(sceneIndex)) {
        filters.push('vidstabdetect=shakiness=5:accuracy=15');
        // two-pass: detect then transform
    }
    const filt = fx.filterByScene?.[sceneIndex];
    if (filt === 'bw') filters.push('format=gray');
    else if (filt === 'vintage') filters.push('curves=vintage, saturation=1.2');
    else if (filt === 'sepia') filters.push('sepia=0.8');
    if (fx.blurScenes?.includes(sceneIndex)) filters.push('boxblur=10');

    if (filters.length === 0) return clipPath;
    const out = path.join(workDir, `fx_${sceneIndex}_${tag.join('_')}.mp4`);
    let res = run(clipPath, out, filters);

    if (fx.stabilizeScenes?.includes(sceneIndex)) {
        const stab = path.join(workDir, `fx_${sceneIndex}_stab.mp4`);
        try {
            execFileSync(ff(), ['-y', '-i', res, '-vf', 'vidstabtransform=smoothing=30:input=transforms.trf', '-an', '-c:v', 'libx264', '-preset', 'veryfast', stab], { stdio: 'ignore', timeout: 90000 });
            if (fs.existsSync(stab) && fs.statSync(stab).size > 0) res = stab;
        } catch { /* keep previous */ }
    }
    return res;
}

/** Chroma-key (green-screen) removal for a clip. Returns new path. */
export function applyChromaKey(clipPath: string, sceneIndex: number, fx: FxJob, workDir: string): string {
    if (!fx.chromaKeyScenes?.includes(sceneIndex) || !fs.existsSync(clipPath)) return clipPath;
    const out = path.join(workDir, `fx_${sceneIndex}_key.mp4`);
    const res = run(clipPath, out, ['colorkey=green:0.3:0.1']);
    return res;
}

/** Ken Burns zoompan filter string for Remotion/ffmpeg usage. */
export function kenBurnsFilter(zoom = 1.15, durationSec = 5): string {
    return `zoompan=z='min(zoom*1.005,${zoom})':d=${Math.round(durationSec * 25)}:s=1280x720:fps=25`;
}
