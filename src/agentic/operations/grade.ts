/**
 * grade.ts — apply a cinematic COLOR GRADE / genre LOOK to an EXISTING clip
 * (single task). Zero-cost: ffmpeg video filters only.
 *
 * Reuses the project's GENRE vocabulary (cinematic, vivid, neon, teal-orange,
 * bleach-bypass, neutral, warm, cool) as named filter presets — the same
 * names the agentic pipeline's genre-style plugin uses, now addressable on any
 * file a user already has.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';

export type GradePreset =
    | 'cinematic'
    | 'vivid'
    | 'neon'
    | 'teal-orange'
    | 'bleach-bypass'
    | 'neutral'
    | 'warm'
    | 'cool';

const PRESETS: Record<GradePreset, string> = {
    // Filmic contrast + lifted blacks + slight teal/orange bias.
    cinematic: 'colorbalance=rs=.02:gs=0:bs=-.02:rm=0:gm=0:bm=.02,eq=contrast=1.15:saturation=1.05:brightness=-0.02',
    vivid: 'eq=contrast=1.25:saturation=1.4:brightness=0.02',
    neon: 'eq=contrast=1.2:saturation=1.6:hue=15',
    'teal-orange': 'colorbalance=rs=-.06:bs=.06:rm=.04:bm=-.04,eq=contrast=1.1:saturation=1.1',
    'bleach-bypass': 'eq=contrast=1.4:saturation=0.25:brightness=0.03',
    neutral: 'eq=contrast=1.05:saturation=1.0',
    warm: 'colorbalance=rs=.04:gs=0:bs=-.04,eq=saturation=1.1:contrast=1.05',
    cool: 'colorbalance=rs=-.04:gs=0:bs=.04,eq=saturation=1.1:contrast=1.05',
};

export interface GradeResult { ok: boolean; output?: string; detail: string; }

export async function gradeVideo(file: string, preset: GradePreset = 'cinematic', out?: string): Promise<GradeResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const vf = PRESETS[preset] ?? PRESETS.cinematic;
    const output = out ?? path.join(process.cwd(), 'output', `graded_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const { code, out: log } = await runFfmpeg([
        '-i', file, '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-y', output,
    ]);
    if (code !== 0) return { ok: false, detail: `grade failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'graded file not produced' };
    return { ok: true, output, detail: `applied '${preset}' grade to ${file}` };
}
