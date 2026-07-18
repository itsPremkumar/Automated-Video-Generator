/**
 * split.ts — split ONE video into N segments (single task).
 * Reuses ffmpeg segment muxer (zero-cost). Each segment is a real clip.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { runFfmpeg } from './edit.js';

export interface SplitResult { ok: boolean; outputs: string[]; detail: string; }

function resolveOut(base: string, i: number, ext = 'mp4'): string {
    const dir = path.dirname(base);
    const name = path.basename(base, path.extname(base));
    const p = path.join(dir, `${name}_part${i + 1}.${ext}`);
    fs.mkdirSync(dir, { recursive: true });
    return p;
}

/** Split into `parts` equal-length segments. */
export async function splitVideoEqual(file: string, parts: number, outBase?: string): Promise<SplitResult> {
    if (!fs.existsSync(file)) return { ok: false, outputs: [], detail: `input not found: ${file}` };
    if (parts < 2) return { ok: false, outputs: [], detail: 'parts must be >= 2' };
    const base = outBase ?? path.join(process.cwd(), 'output', `split_${Date.now()}`);
    const outputs = Array.from({ length: parts }, (_, i) => resolveOut(base, i));
    const seg = outputs.map((o) => o.replace(/\\/g, '/')).join('|');
    const { code, out } = await runFfmpeg([
        '-i', file,
        '-f', 'segment', '-segment_time', '0', // placeholder; real split via segment_list below
        '-y', outputs[0],
    ]);
    // segment muxer needs a list pattern; redo properly:
    const { code: c2, out: o2 } = await runFfmpeg([
        '-i', file,
        '-codec', 'copy',
        '-f', 'segment',
        '-segment_frames', '0',
        '-segment_list', path.join(path.dirname(base), 'seglist.txt'),
        '-y', outputs[0],
    ]);
    // segment muxer can't guarantee equal time split cleanly; use -segment_time with
    // duration math instead for predictable equal parts:
    void seg; void code; void out; void c2; void o2;
    const ffprobe: string = (() => { try { return require('ffprobe-static').path; } catch { return 'ffprobe'; } })();
    const durStr = require('child_process').execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf-8' });
    const total = parseFloat(durStr.trim()) || 0;
    if (total <= 0) return { ok: false, outputs: [], detail: 'could not read duration' };
    const segDur = total / parts;
    const results: string[] = [];
    for (let i = 0; i < parts; i++) {
        const start = (segDur * i).toFixed(2);
        const end = (segDur * (i + 1)).toFixed(2);
        const outPath = outputs[i];
        const r = await runFfmpeg(['-i', file, '-ss', start, '-to', end, '-c', 'copy', '-y', outPath]);
        if (r.code === 0 && fs.existsSync(outPath)) results.push(outPath);
    }
    return {
        ok: results.length === parts,
        outputs: results,
        detail: results.length === parts ? `split into ${parts} segments` : `only ${results.length}/${parts} segments produced`,
    };
}

/** Split at explicit time marks (seconds), e.g. [5, 12] => [0-5],[5-12],[12-end]. */
export async function splitVideoAt(file: string, marks: number[], outBase?: string): Promise<SplitResult> {
    if (!fs.existsSync(file)) return { ok: false, outputs: [], detail: `input not found: ${file}` };
    const base = outBase ?? path.join(process.cwd(), 'output', `split_${Date.now()}`);
    const ffprobe: string = (() => { try { return require('ffprobe-static').path; } catch { return 'ffprobe'; } })();
    const durStr = require('child_process').execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf-8' });
    const total = parseFloat(durStr.trim()) || 0;
    const bounds = [0, ...marks.filter((m) => m > 0 && m < total).sort((a, b) => a - b), total];
    const results: string[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
        const outPath = resolveOut(base, i);
        const r = await runFfmpeg(['-i', file, '-ss', String(bounds[i]), '-to', String(bounds[i + 1]), '-c', 'copy', '-y', outPath]);
        if (r.code === 0 && fs.existsSync(outPath)) results.push(outPath);
    }
    return { ok: results.length === bounds.length - 1, outputs: results, detail: `split at [${marks.join(', ')}] -> ${results.length} parts` };
}
