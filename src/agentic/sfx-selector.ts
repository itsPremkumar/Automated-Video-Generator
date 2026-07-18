/**
 * sfx-selector.ts — selects appropriate sound effects per scene based on content.
 *
 * The agent (or heuristic) decides which SFX to use for:
 *   - transitions between scenes
 *   - emphasis on key words
 *   - intro/outro moments
 *
 * All SFX are generated via bundled ffmpeg-static — zero network, zero keys.
 */

import { Plan } from './types.js';
import { ffmpegSfxGenerator, localSfxProvider } from '../lib/free-media/index.js';
import { SfxClip, SfxKind } from '../lib/free-sfx/models.js';

export interface SceneSfxPlan {
    sceneIndex: number;
    transitionIn: SfxKind | null; // SFX when entering this scene
    transitionOut: SfxKind | null; // SFX when leaving this scene
    emphasisPoints: { atMs: number; kind: SfxKind }[]; // during the scene
}

/**
 * Heuristic SFX selection — no AI needed.
 * Maps scene content keywords and position to appropriate SFX.
 */
export function planSceneSfx(plan: Plan): SceneSfxPlan[] {
    const plans: SceneSfxPlan[] = [];

    for (let i = 0; i < plan.scenes.length; i++) {
        const scene = plan.scenes[i];
        const keywords = scene.searchKeywords.join(' ').toLowerCase();
        const isIntro = i === 0;
        const isOutro = i === plan.scenes.length - 1;
        const transitionIn = pickTransitionIn(i, keywords, isIntro);
        const transitionOut = pickTransitionOut(i, keywords, isOutro, plan.scenes.length);
        const emphasisPoints = pickEmphasisPoints(scene.voiceoverText, scene.durationSec);

        plans.push({ sceneIndex: i, transitionIn, transitionOut, emphasisPoints });
    }

    return plans;
}

function pickTransitionIn(sceneIndex: number, _keywords: string, isIntro: boolean): SfxKind | null {
    if (isIntro) return 'whoosh';
    if (sceneIndex === 1) return 'swish';
    // Middle scenes: quiet or none
    if (sceneIndex % 3 === 0) return 'transition';
    return null;
}

function pickTransitionOut(
    _sceneIndex: number,
    _keywords: string,
    isOutro: boolean,
    _totalScenes: number,
): SfxKind | null {
    if (isOutro) return 'bounce';
    return null;
}

function pickEmphasisPoints(text: string, durationSec: number): { atMs: number; kind: SfxKind }[] {
    const points: { atMs: number; kind: SfxKind }[] = [];
    const words = text.split(/\s+/);
    const durationMs = durationSec * 1000;

    // Find emphasis-worthy words
    const emphasisWords = [
        'important',
        'amazing',
        'warning',
        'critical',
        'secret',
        'key',
        'number',
        'tip',
        'step',
        'finally',
        'but',
        'however',
        'introducing',
        'announcing',
        'breaking',
        'urgent',
    ];

    for (let w = 0; w < words.length; w++) {
        const clean = words[w].replace(/[^a-zA-Z]/g, '').toLowerCase();
        if (emphasisWords.includes(clean)) {
            const wordPosition = w / words.length;
            const atMs = Math.round(wordPosition * durationMs);
            const kind: SfxKind = clean === 'finally' ? 'bounce' : clean === 'warning' ? 'impact' : 'ding';
            points.push({ atMs, kind });
        }
    }

    // Limit to 2 emphasis points per scene
    return points.slice(0, 2);
}

/**
 * Resolve a planned SFX to an actual audio file.
 * Tries local provider first, falls back to ffmpeg generation.
 */
export async function resolveSfx(kind: SfxKind): Promise<SfxClip | null> {
    const local = await localSfxProvider.getSfx(kind);
    if (local) return local;
    return ffmpegSfxGenerator.getSfx(kind);
}
