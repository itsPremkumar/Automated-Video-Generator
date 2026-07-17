/**
 * plan.ts — STAGE 1: turn a script into a director's plan.
 *
 * Reuses the existing local parser (src/lib/script-parser.ts) to split the
 * script into scenes, then enriches each scene with a music query and a
 * visual preference. Produces a JSON-serialisable Plan the agent controls.
 *
 * Dependency-injected so tests run offline: the parser is passed in.
 */

import { parseScript, ParsedScript } from '../lib/script-parser.js';
import { Plan, ScenePlan } from './types.js';
import { AgentBrain } from './brain.js';

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
    }));
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
    const all = scenes.flatMap((s) => s.searchKeywords).join(' ').toLowerCase();
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
        const q = await brain.deriveMusic(scenes.map((s) => s.voiceoverText || s.searchKeywords.join(' ')), title);
        if (q && q.length > 1) return q;
    } catch { /* fall through */ }
    return deriveMusicQuery(scenes);
}

/**
 * applyProEdits — pure, offline "human editor" transforms on the plan:
 *  1. Hook-first reorder: move the most surprising/intriguing scene to the
 *     open (pro editors lead with the hook, not a flat list).
 *  2. Variable pacing: alternate scene lengths so the rhythm breathes
 *     (uniform duration reads as templated/AI).
 * Both are rule-based (no LLM, $0). Mutates + returns the plan.
 */
const HOOK_WORDS = /\b(did you know|secret|surprising|shock|never|revealed?|hidden|myth|trick|insane|unbelievable|fact)\b/i;
export function applyProEdits(plan: Plan, opts: { hookFirst?: boolean; variablePacing?: boolean } = {}): Plan {
    const scenes = plan.scenes;
    if (scenes.length === 0) return plan;

    // 1. Hook-first: pick the scene whose text best matches a "hook" pattern,
    //    tie-broken by longest word count (more detail = stronger claim).
    if (opts.hookFirst) {
        let bestIdx = 0;
        let bestScore = -1;
        scenes.forEach((s, i) => {
            const txt = s.voiceoverText || '';
            let score = 0;
            if (HOOK_WORDS.test(txt)) score += 100;
            score += txt.split(/\s+/).filter(Boolean).length; // longer = more substance
            if (score > bestScore) { bestScore = score; bestIdx = i; }
        });
        if (bestIdx !== 0) {
            const [hook] = scenes.splice(bestIdx, 1);
            scenes.unshift(hook);
        }
        // renumber
        scenes.forEach((s, i) => { s.sceneNumber = i + 1; });
    }

    // 2. Variable pacing: base ± variation by position. First scene shorter
    //    (punchy open), middle scenes alternate, last scene longer (CTA beat).
    if (opts.variablePacing) {
        const base = 4;
        scenes.forEach((s, i) => {
            let d = base;
            if (i === 0) d = 3;                                 // punchy hook
            else if (i === scenes.length - 1) d = 5;           // lingering close
            else d = base + (i % 2 === 1 ? 1 : -1);           // breathe: 5/3/5/3...
            s.durationSec = Math.max(2, d);
        });
        plan.totalDurationSec = scenes.reduce((acc, s) => acc + s.durationSec, 0);
    }
    return plan;
}
