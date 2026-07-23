/**
 * export-fx.ts — Output format + inspection artifacts.
 *
 * Maps to agentic-scripts.json signals (all optional):
 *   exportFormat → 'mp4' | 'webm' | 'gif'  (post-render transcode)
 *   posterScene   → export a standalone thumbnail from this scene index
 *   contactSheet  → grid of all scene frames for QA
 *
 * GIF + thumbnail are ffmpeg one-liners (ffmpeg-static, zero cost). The
 * contact sheet reuses the existing scene-audit frame logic conceptually but
 * is implemented here as a self-contained ffmpeg tile montage.
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

/** Transcode a rendered mp4/webm into the requested format. */
export function transcode(input: string, format: 'mp4' | 'webm' | 'gif', outDir: string): string | null {
    if (!fs.existsSync(input)) return null;
    const p = ff();
    const base = path.basename(input, path.extname(input));
    if (format === 'gif') {
        const out = path.join(outDir, `${base}.gif`);
        try {
            execFileSync(p, [
                '-y', '-i', input,
                '-vf', 'fps=12,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
                out,
            ], { stdio: 'ignore', timeout: 120000 });
            return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : null;
        } catch { return null; }
    }
    const out = path.join(outDir, `${base}.${format}`);
    const extra = format === 'webm' ? ['-c:v', 'libvpx-vp9', '-c:a', 'libopus'] : ['-c:v', 'libx264', '-c:a', 'aac'];
    try {
        execFileSync(p, ['-y', '-i', input, ...extra, out], { stdio: 'ignore', timeout: 120000 });
        return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : null;
    } catch { return null; }
}

/** Export a standalone poster/thumbnail image from a given timestamp (sec). */
export function exportPoster(input: string, atSec: number, outDir: string): string | null {
    if (!fs.existsSync(input)) return null;
    const p = ff();
    const base = path.basename(input, path.extname(input));
    const out = path.join(outDir, `${base}_poster_${atSec}s.jpg`);
    try {
        execFileSync(p, ['-y', '-ss', String(atSec), '-i', input, '-frames:v', '1', '-q:v', '3', out], { stdio: 'ignore', timeout: 60000 });
        return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : null;
    } catch { return null; }
}

/** Build a contact-sheet grid (2 columns) of evenly spaced frames. */
export function exportContactSheet(input: string, outDir: string, tiles = 6): string | null {
    if (!fs.existsSync(input)) return null;
    const p = ff();
    const base = path.basename(input, path.extname(input));
    const out = path.join(outDir, `${base}_contact_sheet.jpg`);
    try {
        execFileSync(p, [
            '-y', '-i', input,
            '-vf', `select='not(mod(n\,${(tiles * 25) / tiles}))',scale=320:-1,tile=${tiles}x1`,
            '-frames:v', '1', out,
        ], { stdio: 'ignore', timeout: 90000 });
        return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : null;
    } catch { return null; }
}
