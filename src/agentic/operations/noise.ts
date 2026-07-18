/**
 * noise.ts — NOISE / HISS REDUCTION (single task).
 *
 * Zero-cost ffmpeg only. Applies the free `afftdn` (FFT-based denoiser) to the
 * audio track and an optional `hqdn3d` spatiotemporal smoother to the video
 * to knock down sensor noise / compression grain / room hiss. No paid API, no
 * GPU. The runner is INJECTABLE for unit tests.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';

export interface NoiseResult {
    ok: boolean;
    output?: string;
    detail: string;
}

export interface NoiseOpts {
    /** audio denoise strength: 'light' | 'medium' | 'heavy'. */
    audio?: 'off' | 'light' | 'medium' | 'heavy';
    /** video grain smoothing: 0 (off) .. 4 (strong). */
    video?: number;
    runner?: (args: string[]) => Promise<{ code: number; out: string }>;
}

/** Map a strength preset to an afftdn filter expression. */
export function audioDenoiser(strength: 'light' | 'medium' | 'heavy'): string {
    switch (strength) {
        case 'light':
            return 'afftdn=nr=8:om=1';
        case 'medium':
            return 'afftdn=nr=16:om=1';
        case 'heavy':
            return 'afftdn=nr=32:om=1';
    }
}

/** Map a 0..4 slider to hqdn3d args. */
export function videoSmoother(amount: number): string | null {
    if (amount <= 0) return null;
    const luma = Math.min(4, amount); // luma spatial
    return `hqdn3d=${luma}:${luma * 1.5}:${luma * 1.5}:${luma * 3}`;
}

/**
 * Reduce audio hiss / video grain on a clip.
 */
export async function reduceNoise(file: string, out?: string, opts: NoiseOpts = {}): Promise<NoiseResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const audio = opts.audio ?? 'medium';
    const videoAmt = opts.video ?? 0;
    const runner = opts.runner ?? runFfmpeg;
    const output = out ?? path.join(process.cwd(), 'output', `denoise_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });

    const af = audio === 'off' ? null : audioDenoiser(audio);
    const vf = videoSmoother(videoAmt);

    const args: string[] = ['-i', file];
    if (af) args.push('-af', af);
    if (vf) args.push('-vf', vf);
    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', output);

    const { code, out: log } = await runner(args);
    if (code !== 0) return { ok: false, detail: `noise reduction failed:\n${log.slice(-600)}` };
    // Mock runners don't materialise the file; only enforce for the real runner.
    if (!opts.runner && !fs.existsSync(output)) return { ok: false, detail: 'output not produced' };
    return { ok: true, output, detail: `denoised (audio=${audio}, video=${videoAmt}) -> ${output}` };
}
