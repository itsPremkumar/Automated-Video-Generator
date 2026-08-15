/**
 * ai/providers/cogvideo.ts — local text-to-video via CogVideoX-2B.
 *
 * Runs CogVideoX-2B locally via Diffusers (Python).
 * Generates 49 frames (~4s) at 480x480, upscaled later.
 * Works on 6GB RAM with --lowvram / fp16.
 *
 * Identity-preserving: returns '' when model not available.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { logInfo } from '../../../shared/logging/runtime-logging.js';

const COGVIDEO_URL = process.env.COGVIDEO_URL || 'http://127.0.0.1:8189';
const COGVIDEO_TIMEOUT = Math.max(60000, Number(process.env.COGVIDEO_TIMEOUT_MS || 600000));
const COGVIDEO_SCRIPT = process.env.COGVIDEO_SCRIPT || ''; // path to standalone generate script

/** Check if CogVideo is available (server or script). */
export async function isCogVideoAvailable(): Promise<boolean> {
    if (COGVIDEO_SCRIPT && fs.existsSync(COGVIDEO_SCRIPT)) return true;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`${COGVIDEO_URL}/health`, { signal: ctrl.signal });
        clearTimeout(t);
        return res.ok;
    } catch {
        return false;
    }
}

/** Check if T2V is enabled. */
export function isEnabled(): boolean {
    return !!COGVIDEO_SCRIPT || true; // availability checked at generate time
}

/**
 * Generate a short video clip from text.
 * Returns local mp4 path or '' on failure.
 */
export async function generateVideo(opts: {
    prompt: string;
    outDir: string;
    filename: string;
    orientation?: 'portrait' | 'landscape' | 'square';
    durationSec?: number;
    seed?: number;
}): Promise<string> {
    fs.mkdirSync(opts.outDir, { recursive: true });
    const dest = path.join(opts.outDir, opts.filename);

    // Option 1: Use a standalone Python script
    if (COGVIDEO_SCRIPT && fs.existsSync(COGVIDEO_SCRIPT)) {
        return await runScript(opts, dest);
    }

    // Option 2: Use CogVideo server API
    try {
        return await runServerApi(opts, dest);
    } catch (e: any) {
        logInfo(`[COGVIDEO] Generation failed: ${e?.message ?? e}`);
        return '';
    }
}

async function runScript(opts: any, dest: string): Promise<string> {
    return new Promise((resolve) => {
        const args = [
            COGVIDEO_SCRIPT,
            '--prompt', opts.prompt,
            '--output', dest,
            '--model', 'THUDM/CogVideoX-2b',
            '--fp16',
            '--lowvram',
        ];
        if (opts.seed) args.push('--seed', String(opts.seed));

        const proc = spawn('python', args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, 'CUDA_VISIBLE_DEVICES': '0' },
        });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) {
                logInfo(`[COGVIDEO] Script exited ${code}: ${stderr.slice(-300)}`);
                resolve('');
                return;
            }
            resolve(fs.existsSync(dest) ? dest : '');
        });

        // Timeout
        setTimeout(() => {
            proc.kill();
            resolve('');
        }, COGVIDEO_TIMEOUT);
    });
}

async function runServerApi(opts: any, dest: string): Promise<string> {
    const res = await fetch(`${COGVIDEO_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: opts.prompt,
            num_frames: Math.min(49, Math.max(16, (opts.durationSec || 4) * 12)),
            width: opts.orientation === 'landscape' ? 720 : opts.orientation === 'portrait' ? 480 : 576,
            height: opts.orientation === 'portrait' ? 720 : opts.orientation === 'landscape' ? 480 : 576,
            num_inference_steps: 50,
            guidance_scale: 6,
            seed: opts.seed ?? Math.floor(Math.random() * 2147483647),
        }),
    });

    if (!res.ok) {
        logInfo(`[COGVIDEO] Server returned ${res.status}`);
        return '';
    }

    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return fs.existsSync(dest) ? dest : '';
}
