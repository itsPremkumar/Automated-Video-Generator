/**
 * captions.ts — burn/embed captions onto an EXISTING video (single task).
 *
 * Two modes:
 *  - text: caller passes the caption text; we derive word/sentence cues and
 *    burn them with ffmpeg drawtext (no external dep).
 *  - srt: caller passes an existing .srt path; we burn it directly.
 *
 * Reuses the project's caption-timing heuristic (syllableWordTimings) so the
 * result looks like the agentic pipeline's captions. Zero-cost (ffmpeg only).
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';
import { syllableWordTimings, CaptionSegment } from '../../lib/captions.js';

export interface CaptionResult { ok: boolean; output?: string; detail: string; }

function tmpFontSafe(): string {
    const candidates = [
        'C:/Windows/Fonts/arial.ttf',
        'C:/Windows/Fonts/seguiemj.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ];
    return candidates.find((f) => fs.existsSync(f)) ?? 'Arial';
}

function buildDrawtextFilter(segments: CaptionSegment[], font: string): string {
    // One drawtext per cue, enabled only during its time window.
    return segments
        .map((s, i) => {
            const start = (s.startMs / 1000).toFixed(2);
            const end = (s.endMs / 1000).toFixed(2);
            const text = (s.text || '').replace(/:/g, '\\:').replace(/'/g, "'\\''").replace(/"/g, '\\"').replace(/,/g, '\\,').replace(/\\/g, '/');
            return `drawtext=fontfile='${font.replace(/\\/g, '/')}':text='${text}':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.5:boxborderw=12:x=(w-text_w)/2:y=h-text_h-40:enable='between(t,${start},${end})'`;
        })
        .join(',');
}

/** Burn captions onto an existing video from raw text. */
export async function addCaptionsFromText(file: string, text: string, out?: string, mode: 'sentence' | 'word' = 'word'): Promise<CaptionResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const output = out ?? path.join(process.cwd(), 'output', `captioned_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const durSec = 5; // generic; word timing fills the span
    const segments = mode === 'word' ? syllableWordTimings(text, durSec * 1000) : [{ text, startMs: 0, endMs: durSec * 1000 }];
    const font = tmpFontSafe();
    const vf = buildDrawtextFilter(segments, font);
    const { code, out: log } = await runFfmpeg(['-i', file, '-vf', vf, '-c:a', 'copy', '-y', output]);
    if (code !== 0) return { ok: false, detail: `caption burn failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'captioned file not produced' };
    return { ok: true, output, detail: `burned captions onto ${file}` };
}

/** Burn an existing .srt sidecar onto a video. */
export async function addCaptionsFromSrt(file: string, srtPath: string, out?: string): Promise<CaptionResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `video not found: ${file}` };
    if (!fs.existsSync(srtPath)) return { ok: false, detail: `srt not found: ${srtPath}` };
    const output = out ?? path.join(process.cwd(), 'output', `captioned_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const font = tmpFontSafe().replace(/\\/g, '/');
    // ffmpeg subtitles filter needs forward-slash paths on win too.
    const srt = srtPath.replace(/\\/g, '/');
    const { code, out: log } = await runFfmpeg([
        '-i', file,
        '-vf', `subtitles='${srt}':force_style='FontName=Arial,FontSize=24,PrimaryColour=&HFFFFFF&'`,
        '-c:a', 'copy', '-y', output,
    ]);
    if (code !== 0) return { ok: false, detail: `srt burn failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'captioned file not produced' };
    return { ok: true, output, detail: `burned ${srtPath} onto ${file}` };
}
