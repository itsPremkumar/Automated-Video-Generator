/**
 * remove-bg.ts — remove background from an image using on-device AI (rembg).
 *
 * Calls the bundled Python script (tools/remove_bg.py) in the project's venv.
 * Zero API cost, runs entirely offline. Model downloads on first use (~200 MB).
 *
 * Usage:
 *   const r = await removeBackground('input/visuals/photo.jpg', 'input/visuals/photo_nobg.png');
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export interface RemoveBgResult {
    ok: boolean;
    output?: string;
    detail: string;
}

const python: string = (() => {
    const p = path.resolve(process.cwd(), 'venv', 'Scripts', 'python.exe');
    if (fs.existsSync(p)) return p;
    // fallback: system python
    return 'python3';
})();

const script: string = (() => {
    const p = path.resolve(process.cwd(), 'tools', 'remove_bg.py');
    return fs.existsSync(p) ? p : '';
})();

/**
 * Remove the background from an image using rembg.
 *
 * @param input   Path to the source image (jpg/png/webp).
 * @param output  Path for the output PNG (transparent background).
 * @param model   Model name: 'u2net' (default, balanced), 'u2netp' (fast/light),
 *                'isnet-general-use' (best quality), 'u2net_human_seg' (people).
 */
export async function removeBackground(
    input: string,
    output: string,
    model: string = 'u2net',
): Promise<RemoveBgResult> {
    if (!fs.existsSync(input)) return { ok: false, detail: `input not found: ${input}` };
    if (!script) return { ok: false, detail: 'tools/remove_bg.py not found' };
    if (!fs.existsSync(python)) return { ok: false, detail: `python not found at ${python}` };

    fs.mkdirSync(path.dirname(output), { recursive: true });

    return new Promise((resolve) => {
        const args = [script, input, output, '--model', model];
        const child = spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let err = '';

        child.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
        child.stderr?.on('data', (d: Buffer) => { err += d.toString(); });

        child.on('close', (code) => {
            if (code === 0 && fs.existsSync(output) && fs.statSync(output).size > 0) {
                resolve({ ok: true, output, detail: `background removed: ${input} -> ${output}` });
            } else {
                const detail = err.slice(-600) || out.slice(-600) || `exit code ${code}`;
                resolve({ ok: false, detail: `remove-bg failed: ${detail}` });
            }
        });

        child.on('error', (e) => {
            resolve({ ok: false, detail: `remove-bg spawn error: ${e.message}` });
        });
    });
}
