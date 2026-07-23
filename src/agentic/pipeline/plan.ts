/**
 * plan.ts — STAGE 1: turn a script into a director's plan.
 *
 * Reuses the existing local parser (src/lib/script-parser.ts) to split the
 * script into scenes, then enriches each scene with a music query and a
 * visual preference. Produces a JSON-serialisable Plan the agent controls.
 *
 * Dependency-injected so tests run offline: the parser is passed in.
 */

import { parseScript, ParsedScript } from '../../lib/script-parser.js';
import { Plan, ScenePlan } from '../types.js';
import { AgentBrain } from '../ai/brain.js';

export interface PlanOptions {
    jobId: string;
    title: string;
    orientation?: 'portrait' | 'landscape';
    voice?: string;
    musicQuery?: string;
}

export type Parser = (script: string) => Promise<ParsedScript> | ParsedScript;

function toScenePlans(parsed: ParsedScript): ScenePlan[] {
    return parsed.scenes.map((s) => ({
        sceneNumber: s.sceneNumber,
        voiceoverText: s.voiceoverText,
        searchKeywords: s.searchKeywords,
        visualPreference: s.voiceoverText && s.voiceoverText.length > 0 ? 'video' : 'image',
        durationSec: s.duration,
        localAsset: s.localAsset,
        transition: s.transition,
        grade: s.grade,
        kenBurns: s.kenBurns === 'off' ? false : undefined,
        trimStart: s.trimStart ? parseTimeToSeconds(s.trimStart) : undefined,
        trimEnd: s.trimEnd ? parseTimeToSeconds(s.trimEnd) : undefined,
        captionStyle: s.captionStyle,
        captionColor: s.captionColor,
        fadeIn: s.fadeIn ? parseFloat(s.fadeIn) : undefined,
        fadeOut: s.fadeOut ? parseFloat(s.fadeOut) : undefined,
        voiceOverride: s.voiceOverride,
        musicOverride: s.musicOverride,
        volumeOverride: s.volumeOverride ? parseFloat(s.volumeOverride) : undefined,
        captionTheme: s.captionTheme,
        sfx: s.sfx,
        jCutSec: s.jCutSec,
        vignette: s.vignette,
        kineticText: s.kineticText,
        musicIntensity: s.musicIntensity,
    }));
}

/** Convert "mm:ss" or "0:mm:ss" to seconds. */
function parseTimeToSeconds(t: string): number {
    const parts = t.trim().split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
}
export async function buildPlan(script: string, opts: PlanOptions, parser: Parser = parseScript): Promise<Plan> {
    const parsed = await parser(script);
    const scenes = toScenePlans(parsed);
    const defaultMusic = opts.musicQuery?.trim() || (await deriveMusicQueryAdvanced(scenes, opts.title));
    return {
        jobId: opts.jobId,
        title: opts.title,
        orientation: opts.orientation ?? 'portrait',
        voice: opts.voice ?? 'en-US-JennyNeural',
        musicQuery: defaultMusic,
        scenes,
        totalDurationSec: scenes.reduce((acc, s) => acc + s.durationSec, 0),
    };
}

/** Simple keyword-derived mood for background music when none is given. */
export function deriveMusicQuery(scenes: ScenePlan[]): string {
    const all = scenes
        .flatMap((s) => s.searchKeywords)
        .join(' ')
        .toLowerCase();
    if (/(workout|gym|energ|sport|run)/.test(all)) return 'energetic upbeat workout';
    if (/(calm|relax|sleep|meditat|peace)/.test(all)) return 'calm ambient lofi';
    if (/(tech|future|robot|ai|code)/.test(all)) return 'electronic synthwave tech';
    if (/(sad|loss|story|emotion)/.test(all)) return 'emotional piano cinematic';
    return 'ambient lofi chill';
}

/** B7 — advanced music-mood decision via the agent brain, with heuristic fallback. */
export async function deriveMusicQueryAdvanced(scenes: ScenePlan[], title: string): Promise<string> {
    try {
        const brain = new AgentBrain();
        const q = await brain.deriveMusic(
            scenes.map((s) => s.voiceoverText || s.searchKeywords.join(' ')),
            title,
        );
        if (q && q.length > 1) return q;
    } catch {
        /* fall through */
    }
    return deriveMusicQuery(scenes);
}

/**
 * applyProEdits — pure, offline "human editor" transforms on the plan:
 *  1. Hook-first reorder: move the most surprising/intriguing scene to the
 *     open (pro editors lead with the hook, not a flat list). Uses the agent
 *     brain's B3 hookScene when a model is configured; rule-based fallback.
 *  2. Variable pacing: alternate scene lengths so the rhythm breathes
 *     (uniform duration reads as templated/AI). Uses brain's B6 paceScenes
 *     when available; rule-based fallback.
 * Both are $0. Mutates + returns the plan.
 */
const HOOK_WORDS =
    /\b(did you know|secret|surprising|shock|never|revealed?|hidden|myth|trick|insane|unbelievable|fact)\b/i;
export async function applyProEdits(
    plan: Plan,
    opts: { hookFirst?: boolean; variablePacing?: boolean; brain?: import('../ai/brain.js').AgentBrain } = {},
): Promise<Plan> {
    const scenes = plan.scenes;
    if (scenes.length === 0) return plan;

    // 1. Hook-first: prefer the brain's B3 pick; fall back to pattern+length.
    if (opts.hookFirst) {
        let bestIdx = 0;
        if (opts.brain) {
            const picked = await opts.brain.hookScene(scenes.map((s) => s.voiceoverText));
            if (picked != null && picked >= 0 && picked < scenes.length) bestIdx = picked;
        }
        if (bestIdx === 0) {
            let bestScore = -1;
            scenes.forEach((s, i) => {
                const txt = s.voiceoverText || '';
                let score = 0;
                if (HOOK_WORDS.test(txt)) score += 100;
                score += txt.split(/\s+/).filter(Boolean).length; // longer = more substance
                if (score > bestScore) {
                    bestScore = score;
                    bestIdx = i;
                }
            });
        }
        if (bestIdx !== 0) {
            const [hook] = scenes.splice(bestIdx, 1);
            scenes.unshift(hook);
        }
        // renumber
        scenes.forEach((s, i) => {
            s.sceneNumber = i + 1;
        });
    }

    // 2. Variable pacing: brain B6 weights when available; else rule-based.
    //    Also adjusts duration proportionally to text length (words / 2.5 wps speaking rate).
    if (opts.variablePacing) {
        const base = 4;
        let weights: number[] | null = null;
        if (opts.brain) weights = await opts.brain.paceScenes(scenes.map((s) => s.voiceoverText));
        scenes.forEach((s, i) => {
            // Start with breathing/minimum duration
            let minDur: number;
            if (weights) {
                minDur = Math.max(2, Math.round(base * (weights[i] ?? 1)));
            } else {
                if (i === 0) minDur = 3;       // punchy hook
                else if (i === scenes.length - 1) minDur = 5; // lingering close
                else minDur = base + (i % 2 === 1 ? 1 : -1);  // breathe: 5/3/5/3...
                minDur = Math.max(2, minDur);
            }
            // Duration from text length (~2.5 words/sec speaking rate)
            const words = (s.voiceoverText || '').split(/\s+/).filter(Boolean).length;
            const wordDur = words / 2.5;
            // Blend: at least the breathing minimum, at most 8 seconds
            s.durationSec = Math.max(minDur, Math.min(Math.round(wordDur), 8));
        });
        plan.totalDurationSec = scenes.reduce((acc, s) => acc + s.durationSec, 0);
    }
    return plan;
}
