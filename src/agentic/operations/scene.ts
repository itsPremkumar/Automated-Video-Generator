/**
 * scene.ts — SCENE DETECTION + SMART TRIM (single task).
 *
 * Zero-cost ffmpeg only (signalstats/scdet filter). Scans a video for shot
 * boundaries (scene changes) using the free `scdet` filter, then either:
 *   - lists the detected scene cuts (timestamps), or
 *   - trims the clip to the single most "interesting" scene / a chosen scene
 *     index, or
 *   - auto-chapters: emits a list of (start,end,label) chapters for downstream
 *     caption/burn-in use.
 *
 * No paid API, no GPU. The detector runner is INJECTABLE so the cut-detection
 * logic is unit-testable with a mock that returns known scdet lines.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';

export interface SceneCut { time: number; score: number; }

export interface Chapter { start: number; end: number; label: string; }

export interface SceneResult {
    ok: boolean;
    output?: string;
    detail: string;
    cuts?: SceneCut[];
    chapters?: Chapter[];
    /** when trimming to a scene, the kept [start,end] */
    kept?: { start: number; end: number };
}

/** Parse scdet stderr lines into scene cuts. */
export function parseSceneCuts(log: string): SceneCut[] {
    const cuts: SceneCut[] = [];
    const re = /scene_cut_detected time=(\d+(?:\.\d+)?) score=(\d+(?:\.\d+)?)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(log))) {
        cuts.push({ time: parseFloat(m[1]), score: parseFloat(m[2]) });
    }
    return cuts;
}

/** Turn scene cuts + total duration into chapter markers. */
export function buildChapters(cuts: SceneCut[], duration: number): Chapter[] {
    const bounds = [0, ...cuts.map((c) => c.time), duration].filter((t) => t <= duration + 1e-6);
    const chapters: Chapter[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
        const s = bounds[i];
        const e = bounds[i + 1];
        if (e - s < 0.05) continue;
        chapters.push({ start: s, end: e, label: `Scene ${i + 1}` });
    }
    return chapters;
}

/** Pick the longest scene span (most content). */
export function longestScene(chapters: Chapter[]): { start: number; end: number } | null {
    if (chapters.length === 0) return null;
    return chapters.reduce((best, c) => (c.end - c.start > best.end - best.start ? c : best), chapters[0]);
}

export interface SceneOpts {
    /** action: just detect, trim to longest scene, or emit chapters. */
    mode?: 'detect' | 'trim' | 'chapters';
    /** index of scene to keep when mode==='trim' (0-based). */
    sceneIndex?: number;
    /** total duration (seconds) — needed for chapters/trim. Tests inject it. */
    duration?: number;
    runner?: (args: string[]) => Promise<{ code: number; out: string }>;
}

/**
 * Detect scenes / trim to best scene / build chapters.
 */
export async function detectScenes(
    file: string,
    out?: string,
    opts: SceneOpts = {},
): Promise<SceneResult> {
    if (!fs.existsSync(file)) return { ok: false, detail: `input not found: ${file}` };
    const mode = opts.mode ?? 'detect';
    const runner = opts.runner ?? runFfmpeg;

    const det = await runner(['-i', file, '-vf', 'scdet', '-f', 'null', '-']);
    if (det.code !== 0) return { ok: false, detail: `scene detect failed:\n${det.out.slice(-600)}` };

    const cuts = parseSceneCuts(det.out);
    const duration = opts.duration ?? parseDurationHint(det.out) ?? 0;

    if (mode === 'detect') {
        return { ok: true, detail: `detected ${cuts.length} scene cut(s)`, cuts };
    }

    const chapters = buildChapters(cuts, duration);
    if (mode === 'chapters') {
        return { ok: true, detail: `built ${chapters.length} chapter(s)`, chapters };
    }

    // mode === 'trim'
    if (chapters.length === 0) {
        // No cuts → whole clip is one scene; copy through.
        const output = out ?? path.join(process.cwd(), 'output', `scene_${Date.now()}.mp4`);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        const pass = await runner(['-i', file, '-c', 'copy', '-y', output]);
        return { ok: pass.code === 0, output: pass.code === 0 ? output : undefined, detail: 'no scene cuts; kept whole clip', kept: { start: 0, end: duration } };
    }
    const idx = opts.sceneIndex ?? -1; // -1 → longest
    const chosen = idx >= 0 ? chapters[idx] : longestScene(chapters)!;
    const output = out ?? path.join(process.cwd(), 'output', `scene_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const { code, out: log } = await runner([
        '-i', file, '-ss', String(chosen.start), '-to', String(chosen.end),
        '-c', 'copy', '-y', output,
    ]);
    if (code !== 0) return { ok: false, detail: `scene trim failed:\n${log.slice(-600)}` };
    if (!fs.existsSync(output)) return { ok: false, detail: 'output not produced' };
    return { ok: true, output, detail: `trimmed to scene [${chosen.start.toFixed(2)}–${chosen.end.toFixed(2)}]`, kept: { start: chosen.start, end: chosen.end } };
}

function parseDurationHint(log: string): number | null {
    const m = log.match(/DURATION:([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
}
