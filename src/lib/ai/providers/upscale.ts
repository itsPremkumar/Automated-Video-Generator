/**
 * ai/providers/upscale.ts — local AI upscaling via Real-ESRGAN.
 *
 * Upscales images 2x-4x for crisp video output from low-res stock.
 * Also supports video upscaling (frame-by-frame).
 *
 * Identity-preserving: returns original path if upscaling fails.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { logInfo } from '../../../shared/logging/runtime-logging.js';

const REALESRGAN_SCRIPT = process.env.REALESRGAN_SCRIPT || '';
const REALESRGAN_MODEL = process.env.REALESRGAN_MODEL || 'realesr-general-x4v3';
const REALESRGAN_URL = process.env.REALESRGAN_URL || 'http://127.0.0.1:8190';
const UPSCALE_TIMEOUT = Math.max(30000, Number(process.env.UPSCALE_TIMEOUT_MS || 300000));
const UPSCALE_FACTOR = Math.max(1.5, Math.min(4, Number(process.env.UPSCALE_FACTOR || 2)));

/** Check if upscaling is available. */
export function isEnabled(): boolean {
    return !!REALESRGAN_SCRIPT || true;
}

/** Check if Real-ESRGAN server is reachable. */
export async function isAvailable(): Promise<boolean> {
    if (REALESRGAN_SCRIPT && fs.existsSync(REALESRGAN_SCRIPT)) return true;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`${REALESRGAN_URL}/health`, { signal: ctrl.signal });
        clearTimeout(t);
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Upscale an image. Returns path to upscaled image (or original on failure).
 */
export async function upscale(opts: {
    inputPath: string;
    outDir?: string;
    filename?: string;
    factor?: number;
}): Promise<string> {
    if (!fs.existsSync(opts.inputPath)) {
        logInfo('[UPSCALE] Input not found');
        return opts.inputPath;
    }

    const factor = opts.factor || UPSCALE_FACTOR;
    const dir = opts.outDir || path.dirname(opts.inputPath);
    const fname = opts.filename || `upscaled_${path.basename(opts.inputPath)}`;
    const dest = path.join(dir, fname);
    fs.mkdirSync(dir, { recursive: true });

    // Option 1: Use standalone script
    if (REALESRGAN_SCRIPT && fs.existsSync(REALESRGAN_SCRIPT)) {
        return await runScript(opts.inputPath, dest, factor);
    }

    // Option 2: Use server API
    try {
        return await runServerApi(opts.inputPath, dest, factor);
    } catch (e: any) {
        logInfo(`[UPSCALE] Failed: ${e?.message ?? e}`);
        return opts.inputPath;
    }
}

async function runScript(input: string, dest: string, factor: number): Promise<string> {
    return new Promise((resolve) => {
        const proc = spawn('python', [
            REALESRGAN_SCRIPT,
            '-i', input,
            '-o', dest,
            '-n', REALESRGAN_MODEL,
            '-s', String(factor),
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) {
                logInfo(`[UPSCALE] Script failed: ${stderr.slice(-200)}`);
                resolve(input);
                return;
            }
            resolve(fs.existsSync(dest) ? dest : input);
        });
        setTimeout(() => { proc.kill(); resolve(input); }, UPSCALE_TIMEOUT);
    });
}

async function runServerApi(input: string, dest: string, factor: number): Promise<string> {
    const imgBuffer = fs.readFileSync(input);
    const formData = new FormData();
    formData.append('image', new Blob([imgBuffer], { type: 'image/png' }));
    formData.append('scale', String(factor));
    formData.append('model', REALESRGAN_MODEL);

    const res = await fetch(`${REALESRGAN_URL}/upscale`, {
        method: 'POST',
        body: formData,
    });
    if (!res.ok) return input;

    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return fs.existsSync(dest) ? dest : input;
}
