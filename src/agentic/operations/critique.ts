/**
 * critique.ts — the "Director's Critique": the assistant watches its own render
 * and proposes concrete, actionable edits. This is the missing half of a real
 * video-editor assistant: the generator ships blind, critique.ts closes the
 * loop by sampling the output and returning structured suggestions.
 *
 * ZERO-COST: uses the existing ffmpeg-based video-analyzer (offline, no keys).
 * When an optional vision model is configured (AgentBrain), frame-level content
 * issues (e.g. "caption overlaps logo", "scene too dark") are appended.
 *
 * Output is intentionally machine-readable so it can be fed straight into
 * revise.ts / agentic:revise (the re-edit loop).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    analyzeOutput,
    detectBlackFrames,
    detectFreezeFrames,
    analyzeAudio,
    analyzeDimensions,
} from '../media/video-analyzer.js';
import { AgentBrain } from '../ai/brain.js';

export interface CritiqueSuggestion {
    /** Scene index (0-based) the suggestion targets, or 'global' for the whole piece. */
    scope: number | 'global';
    issue: string;
    severity: 'blocker' | 'major' | 'minor';
    /** Concrete fix hint the revise flow can apply directly. */
    fix: Partial<{
        captionStyle: 'top' | 'center' | 'bottom';
        captionColor: string;
        grade: string;
        kenBurns: boolean;
        volumeOverride: number;
        fadeIn: number;
        fadeOut: number;
    }>;
}

export interface CritiqueReport {
    path: string;
    suggestions: CritiqueSuggestion[];
    raw: {
        blackCount: number;
        longestBlack: number;
        freezeCount: number;
        longestFreeze: number;
        peakDb: number;
        meanDb: number;
        clipping: boolean;
        width: number;
        height: number;
        codec: string;
    };
    ok: boolean;
}

/** Extract per-scene durations from a plan.json so we can localise issues. */
function sceneBoundaries(planPath: string): { start: number; end: number }[] {
    try {
        const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
        const scenes = (plan.scenes || []) as any[];
        const out: { start: number; end: number }[] = [];
        let acc = 0;
        for (const s of scenes) {
            const d = Number(s.durationSec) || 4;
            out.push({ start: acc, end: acc + d });
            acc += d;
        }
        return out;
    } catch {
        return [];
    }
}

/** Map a timestamp (seconds) to a 0-based scene index using plan boundaries. */
function sceneAt(boundaries: { start: number; end: number }[], t: number): number {
    for (let i = 0; i < boundaries.length; i++) {
        if (t >= boundaries[i].start && t < boundaries[i].end) return i;
    }
    return boundaries.length - 1;
}

/**
 * Critique a rendered MP4. `planPath` (optional) lets us attribute black/freeze
 * stretches to a specific scene so the suggestion's `scope` is a scene number.
 */
export async function critiqueVideo(
    mp4Path: string,
    opts: { planPath?: string; brain?: AgentBrain | null } = {},
): Promise<CritiqueReport> {
    const suggestions: CritiqueSuggestion[] = [];
    const boundaries = opts.planPath && fs.existsSync(opts.planPath) ? sceneBoundaries(opts.planPath) : [];

    let black: Awaited<ReturnType<typeof detectBlackFrames>>;
    let freeze: Awaited<ReturnType<typeof detectFreezeFrames>>;
    let audio: Awaited<ReturnType<typeof analyzeAudio>>;
    let dim: Awaited<ReturnType<typeof analyzeDimensions>>;
    try {
        [black, freeze, audio, dim] = await Promise.all([
            detectBlackFrames(mp4Path),
            detectFreezeFrames(mp4Path),
            analyzeAudio(mp4Path),
            analyzeDimensions(mp4Path),
        ]);
    } catch {
        // Defensive: if any analyzer throws, run them independently so one
        // failure doesn't blank the whole critique.
        black = await detectBlackFrames(mp4Path).catch(() => []);
        freeze = await detectFreezeFrames(mp4Path).catch(() => []);
        audio = await analyzeAudio(mp4Path).catch(() => ({ peakDb: -999, meanVolumeDb: -999, clipping: false }));
        dim = await analyzeDimensions(mp4Path).catch(() => ({ width: 0, height: 0, codec: '', pixFmt: '', colorRange: '' }));
    }

    let longestBlack = 0;
    let blackCount = 0;
    for (const b of black) {
        blackCount++;
        longestBlack = Math.max(longestBlack, b.duration);
        if (b.duration > 0.5) {
            const scope = boundaries.length ? sceneAt(boundaries, b.start) : 'global';
            suggestions.push({
                scope,
                issue: `Long black gap (${b.duration.toFixed(2)}s) at ${b.start.toFixed(1)}s`,
                severity: 'blocker',
                fix: {},
            });
        }
    }

    let longestFreeze = 0;
    let freezeCount = 0;
    for (const f of freeze) {
        freezeCount++;
        longestFreeze = Math.max(longestFreeze, f.duration);
        if (f.duration > 1.0) {
            const scope = boundaries.length ? sceneAt(boundaries, f.start) : 'global';
            suggestions.push({
                scope,
                issue: `Frozen frame (${f.duration.toFixed(2)}s) at ${f.start.toFixed(1)}s`,
                severity: 'major',
                fix: { kenBurns: false },
            });
        }
    }

    if (audio.clipping) {
        suggestions.push({
            scope: 'global',
            issue: `Audio clipping (peak ${audio.peakDb.toFixed(1)}dB)`,
            severity: 'major',
            fix: { volumeOverride: 0.8 },
        });
    } else if (audio.peakDb <= -30) {
        suggestions.push({
            scope: 'global',
            issue: `Audio very quiet (peak ${audio.peakDb.toFixed(1)}dB) — voice may be inaudible`,
            severity: 'major',
            fix: { volumeOverride: 1.0 },
        });
    } else if (audio.peakDb > -2) {
        suggestions.push({
            scope: 'global',
            issue: `Audio near 0dB, little headroom (peak ${audio.peakDb.toFixed(1)}dB)`,
            severity: 'minor',
            fix: { volumeOverride: 0.9 },
        });
    }

    if (dim.width > 0 && dim.height > 0) {
        const portrait = dim.height > dim.width;
        const landscape = dim.width > dim.height;
        if (!portrait && !landscape) {
            suggestions.push({
                scope: 'global',
                issue: `Square/unexpected aspect ${dim.width}x${dim.height}`,
                severity: 'minor',
                fix: {},
            });
        }
        if (!/^(h264|hevc|vp9|av1)$/.test(dim.codec)) {
            suggestions.push({
                scope: 'global',
                issue: `Non-web codec ${dim.codec} (may not play on all platforms)`,
                severity: 'minor',
                fix: {},
            });
        }
    }

    // OPT-IN: vision model content check (caption overlap, darkness, etc.)
    if (opts.brain && hasModelSafe(opts.brain)) {
        try {
            const frameDir = `${mp4Path}.critique-frames`;
            fs.mkdirSync(frameDir, { recursive: true });
            const f1 = path.join(frameDir, 'f1.jpg');
            const f2 = path.join(frameDir, 'f2.jpg');
            await extractFrame(mp4Path, 1.0, f1);
            await extractFrame(mp4Path, Math.max(2, 2), f2);
            const vision = await (opts.brain as any)?.visionVerify?.(f1, []);
            if (vision && !vision.passes && vision.reason) {
                suggestions.push({
                    scope: 'global',
                    issue: `Vision flagged: ${vision.reason}`,
                    severity: 'minor',
                    fix: {},
                });
            }
            try {
                fs.rmSync(frameDir, { recursive: true, force: true });
            } catch {
                /* ignore */
            }
        } catch {
            /* vision is optional; never blocks critique */
        }
    }

    const ok = suggestions.filter((s) => s.severity === 'blocker' || s.severity === 'major').length === 0;
    return {
        path: mp4Path,
        suggestions,
        raw: {
            blackCount,
            longestBlack,
            freezeCount,
            longestFreeze,
            peakDb: audio.peakDb,
            meanDb: audio.meanVolumeDb,
            clipping: audio.clipping,
            width: dim.width,
            height: dim.height,
            codec: dim.codec,
        },
        ok,
    };
}

function hasModelSafe(brain: AgentBrain): boolean {
    try {
        return Boolean((brain as any)?.hasModel?.());
    } catch {
        return false;
    }
}

function extractFrame(mp4: string, atSec: number, out: string): Promise<void> {
    return new Promise((resolve) => {
        try {
            const ffmpeg = require('ffmpeg-static');
            const { spawn } = require('child_process');
            const c = spawn(ffmpeg, ['-y', '-ss', String(atSec), '-i', mp4, '-frames:v', '1', out], { stdio: 'ignore' });
            const t = setTimeout(() => {
                try {
                    c.kill('SIGKILL');
                } catch {
                    /* ignore */
                }
                resolve();
            }, 20000);
            c.on('close', () => {
                clearTimeout(t);
                resolve();
            });
            c.on('error', () => {
                clearTimeout(t);
                resolve();
            });
        } catch {
            resolve();
        }
    });
}
