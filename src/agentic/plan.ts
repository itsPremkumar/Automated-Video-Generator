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
    const defaultMusic = opts.musicQuery?.trim() || deriveMusicQuery(scenes);
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
