/**
 * ai/providers/bg-removal.ts — local background removal via rembg / SAM2.
 *
 * Extracts subjects from images for compositing over AI backgrounds.
 * Uses rembg (U2-Net) — CPU-friendly, works on 6GB RAM.
 *
 * Identity-preserving: returns '' if removal fails.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { logInfo } from '../../../shared/logging/runtime-logging.js';

const REMBG_SCRIPT = process.env.REMBG_SCRIPT || '';
const REMBG_URL = process.env.REMBG_URL || 'http://127.0.0.1:8191';
const REMBG_MODEL = process.env.REMBG_MODEL || 'u2net';
const BG_REMOVAL_TIMEOUT = Math.max(15000, Number(process.env.BG_REMOVAL_TIMEOUT_MS || 120000));

/** Check if background removal is available. */
export function isEnabled(): boolean {
    return !!REMBG_SCRIPT || true;
}

/** Check if rembg server is reachable. */
export async function isAvailable(): Promise<boolean> {
    if (REMBG_SCRIPT && fs.existsSync(REMBG_SCRIPT)) return true;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`${REMBG_URL}/health`, { signal: ctrl.signal });
        clearTimeout(t);
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Remove background from an image.
 * Returns path to transparent PNG or '' on failure.
 */
export async function removeBg(opts: {
    inputPath: string;
    outDir?: string;
    filename?: string;
}): Promise<string> {
    if (!fs.existsSync(opts.inputPath)) {
        logInfo('[BG-REMOVAL] Input not found');
        return '';
    }

    const dir = opts.outDir || path.dirname(opts.inputPath);
    const fname = opts.filename || `nobg_${path.basename(opts.inputPath, path.extname(opts.inputPath))}.png`;
    const dest = path.join(dir, fname);
    fs.mkdirSync(dir, { recursive: true });

    // Option 1: Use standalone rembg CLI
    if (REMBG_SCRIPT && fs.existsSync(REMBG_SCRIPT)) {
        return await runScript(opts.inputPath, dest);
    }

    // Option 2: Use server API
    try {
        return await runServerApi(opts.inputPath, dest);
    } catch (e: any) {
        logInfo(`[BG-REMOVAL] Failed: ${e?.message ?? e}`);
        return '';
    }
}

async function runScript(input: string, dest: string): Promise<string> {
    return new Promise((resolve) => {
        const proc = spawn('python', [
            REMBG_SCRIPT,
            'i',
            '-m', REMBG_MODEL,
            input,
            dest,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) {
                logInfo(`[BG-REMOVAL] Script failed: ${stderr.slice(-200)}`);
                resolve('');
                return;
            }
            resolve(fs.existsSync(dest) ? dest : '');
        });
        setTimeout(() => { proc.kill(); resolve(''); }, BG_REMOVAL_TIMEOUT);
    });
}

async function runServerApi(input: string, dest: string): Promise<string> {
    const imgBuffer = fs.readFileSync(input);
    const formData = new FormData();
    formData.append('image', new Blob([imgBuffer], { type: 'image/png' }));
    formData.append('model', REMBG_MODEL);

    const res = await fetch(`${REMBG_URL}/remove`, {
        method: 'POST',
        body: formData,
    });
    if (!res.ok) return '';

    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return fs.existsSync(dest) ? dest : '';
}
