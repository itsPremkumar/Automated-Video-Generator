/**
 * ai/intelligence/clip-match.ts — semantic visual matching via CLIP.
 *
 * Embeds scene text and visual candidates in the same vector space.
 * Returns the most semantically relevant image/video.
 *
 * Identity-preserving: returns null when CLIP unavailable.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { logInfo } from '../../../shared/logging/runtime-logging.js';

const CLIP_SCRIPT = process.env.CLIP_SCRIPT || '';
const CLIP_URL = process.env.CLIP_URL || 'http://127.0.0.1:8193';
const CLIP_MODEL = process.env.CLIP_MODEL || 'ViT-B/32';
const CLIP_TIMEOUT = Math.max(10000, Number(process.env.CLIP_TIMEOUT_MS || 120000));

/** Check if CLIP is available. */
export function isEnabled(): boolean {
    return !!CLIP_SCRIPT || true;
}

/** Check if CLIP server is reachable. */
export async function isAvailable(): Promise<boolean> {
    if (CLIP_SCRIPT && fs.existsSync(CLIP_SCRIPT)) return true;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`${CLIP_URL}/health`, { signal: ctrl.signal });
        clearTimeout(t);
        return res.ok;
    } catch {
        return false;
    }
}

export interface ClipMatchResult {
    bestPath: string;
    scores: { path: string; score: number }[];
}

/**
 * Find the best visual match for a scene using CLIP embeddings.
 */
export async function embed(opts: {
    text: string;
    imagePaths: string[];
    topK?: number;
}): Promise<ClipMatchResult | null> {
    const validPaths = opts.imagePaths.filter(p => fs.existsSync(p));
    if (validPaths.length === 0) {
        logInfo('[CLIP] No valid images provided');
        return null;
    }

    // Option 1: Use standalone script
    if (CLIP_SCRIPT && fs.existsSync(CLIP_SCRIPT)) {
        return await runScript(opts.text, validPaths, opts.topK || 1);
    }

    // Option 2: Use server API
    try {
        return await runServerApi(opts.text, validPaths, opts.topK || 1);
    } catch (e: any) {
        logInfo(`[CLIP] Failed: ${e?.message ?? e}`);
        return null;
    }
}

async function runScript(text: string, imagePaths: string[], topK: number): Promise<ClipMatchResult | null> {
    return new Promise((resolve) => {
        const proc = spawn('python', [
            CLIP_SCRIPT,
            '--text', text,
            '--images', imagePaths.join(','),
            '--topk', String(topK),
            '--model', CLIP_MODEL,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) {
                logInfo(`[CLIP] Script failed: ${stderr.slice(-200)}`);
                resolve(null);
                return;
            }
            try {
                resolve(JSON.parse(stdout) as ClipMatchResult);
            } catch {
                resolve(null);
            }
        });
        setTimeout(() => { proc.kill(); resolve(null); }, CLIP_TIMEOUT);
    });
}

async function runServerApi(text: string, imagePaths: string[], topK: number): Promise<ClipMatchResult | null> {
    const formData = new FormData();
    formData.append('text', text);
    formData.append('topk', String(topK));
    formData.append('model', CLIP_MODEL);

    for (const imgPath of imagePaths) {
        const buf = fs.readFileSync(imgPath);
        formData.append('images', new Blob([buf], { type: 'image/png' }));
    }

    const res = await fetch(`${CLIP_URL}/match`, {
        method: 'POST',
        body: formData,
    });
    if (!res.ok) return null;

    return await res.json() as ClipMatchResult;
}
