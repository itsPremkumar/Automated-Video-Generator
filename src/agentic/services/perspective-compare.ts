/**
 * perspective-compare.ts — tile one representative frame from each rendered
 * perspective video into a single side-by-side sheet, with a label strip per
 * column. Pure ffmpeg (drawtext + xstack), zero new dependencies.
 *
 * Layout for N videos (max 5):
 *   [label bar][frame][label bar][frame]...  → output/perspective-comparison.jpg
 */

import * as fs from 'fs';
import * as path from 'path';

export interface PerspectiveEntry {
    label: string;
    mp4: string;
}

const TILE_W = 480; // per-video frame width in the sheet
const TILE_H = 270; // 16:9
const LABEL_H = 56;

/** Escape text for ffmpeg drawtext (colons/commas/apostrophes are the killers). */
function escLabel(s: string): string {
    return s
        .replace(/'/g, '’') // typographic apostrophe — the documented safe path
        .replace(/[:]/g, '\\:')
        .replace(/[,]/g, '\\,');
}

/**
 * Build the comparison sheet. Returns the output path on success, null when
 * nothing could be extracted (callers degrade to listing paths in text).
 */
export async function buildComparisonSheet(
    entries: PerspectiveEntry[],
    outPath: string,
): Promise<string | null> {
    try {
        const { execFile } = require('child_process') as typeof import('child_process');
        const ffmpeg: string = require('ffmpeg-static');

        const usable = entries.filter((e) => e.mp4 && fs.existsSync(e.mp4)).slice(0, 5);
        if (usable.length === 0) return null;

        const tmpDir = path.join(path.dirname(outPath), '_persp_tmp');
        fs.mkdirSync(tmpDir, { recursive: true });

        // 1. Extract a mid-timestamp frame from each video at tile size.
        const frames: string[] = [];
        const labels: string[] = [];
        for (let i = 0; i < usable.length; i++) {
            const e = usable[i];
            // Mid-point seek: hooks/intros differ most; mid-frame shows body style.
            let durSec = 20;
            try {
                const ffprobe: string = require('ffprobe-static').path;
                const probe: string = await new Promise((res) => {
                    execFile(ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_format', e.mp4],
                        (err: any, stdout: string) => res(err ? '' : stdout));
                });
                const j = JSON.parse(probe || '{}');
                durSec = Number(j?.format?.duration ?? 20) || 20;
            } catch { /* default seek below */ }
            const seek = Math.max(1, Math.floor(durSec / 2));
            const frame = path.join(tmpDir, `persp_${i}.png`);
            await new Promise<void>((resolve) => {
                execFile(ffmpeg,
                    ['-y', '-ss', String(seek), '-i', e.mp4, '-frames:v', '1',
                     '-vf', `scale=${TILE_W}:${TILE_H}:force_original_aspect_ratio=decrease,pad=${TILE_W}:${TILE_H}:(ow-iw)/2:(oh-ih)/2`,
                     frame],
                    () => resolve());
            });
            if (fs.existsSync(frame)) {
                frames.push(frame);
                labels.push(escLabel(e.label).slice(0, 42));
            }
        }
        if (frames.length === 0) return null;

        // 2. Stack each frame over a labeled black bar, then hstack all columns.
        const outDir = path.dirname(outPath);
        fs.mkdirSync(outDir, { recursive: true });
        const args: string[] = ['-y'];
        for (let i = 0; i < frames.length; i++) {
            args.push('-i', frames[i]);
        }
        const fontfile = process.env.PERSPECTIVE_FONT || 'C\\:/Windows/Fonts/arial.ttf';
        const chains: string[] = [];
        const cols: string[] = [];
        for (let i = 0; i < frames.length; i++) {
            const label = labels[i];
            const drawtext =
                `drawtext=fontfile='${fontfile}':text='${label}':` +
                `fontcolor=white:fontsize=22:x=(w-text_w)/2:y=((h-text_h)/2)+2`;
            chains.push(
                `[${i}:v]scale=${TILE_W}:${TILE_H},pad=${TILE_W}:${LABEL_H + TILE_H}:0:${LABEL_H}:black,${drawtext}[c${i}]`,
            );
            cols.push(`[c${i}]`);
        }
        chains.push(`${cols.join('')}hstack=inputs=${frames.length}[out]`);
        args.push('-filter_complex', chains.join(';'), '-map', '[out]', '-frames:v', '1', outPath);

        await new Promise<void>((resolve) => {
            execFile(ffmpeg, args, { timeout: 60000 }, () => resolve());
        });
        if (!fs.existsSync(outPath)) return null;

        // 3. Cleanup temp frames.
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

        console.log(`  🖼 ${path.basename(outPath)}: ${frames.length}-way perspective comparison (${TILE_W * frames.length}x${TILE_H + LABEL_H})`);
        return fs.existsSync(outPath) ? outPath : null;
    } catch (e) {
        console.warn(`⚠ comparison sheet failed: ${(e as Error)?.message ?? e}`);
        return null;
    }
}
