/**
 * style-engine.ts — the "human-feel" editing brain for the agentic pipeline.
 *
 * Given a Plan + chosen AgenticStyle, it deterministically computes, per scene:
 *   - which TRANSITION to use into the next scene (fade / slide / zoom-blur / cut)
 *   - a per-scene COLOR GRADE (warm / cool / cinematic / neutral) for variety
 *   - KINETIC TEXT cues (lower-third reveal + word-pop on emphasis words)
 *   - BEAT splits: where to cut/hit on the voiceover cadence (speech-synced)
 *
 * Everything is deterministic (hashed from topic + scene index) so the same input
 * always yields the same edit — no randomness, no external model. The ffmpeg
 * renderer (orchestrate.ts) consumes the resulting StylePlan. This file is pure
 * computation; it touches no network, no ffmpeg.
 */

export type TransitionKind = 'fade' | 'slide' | 'zoomblur' | 'cut';
export type GradeKind = 'neutral' | 'warm' | 'cool' | 'cinematic' | 'vivid';

export interface KineticCue {
    /** seconds from scene start */
    atSec: number;
    text: string;
    kind: 'lowerthird' | 'wordpop';
}

export interface SceneStyle {
    sceneIndex: number;
    transitionIn: TransitionKind;   // transition used to ENTER this scene (scene 0 = none)
    grade: GradeKind;
    kinetic: KineticCue[];
}

export interface StylePlan {
    name: string;
    transitions: TransitionKind[]; // per-scene transition INTO next (last is unused)
    scenes: SceneStyle[];
}

export interface AgenticStyle {
    /** preset name; drives the whole look */
    preset?: 'cinematic' | 'reels' | 'documentary' | 'documentary-cool' | 'neutral';
    /** override specific knobs */
    transitionBias?: TransitionKind[];
    gradeBias?: GradeKind[];
    kinetic?: boolean;     // animated captions (default true)
    beatSplit?: boolean;   // cut on VO cadence (default false — kept subtle)
}

const TRANSITIONS: TransitionKind[] = ['fade', 'slide', 'zoomblur', 'cut'];
const GRADES: GradeKind[] = ['cinematic', 'warm', 'cool', 'vivid', 'neutral'];

/** Stable, dependency-free string hash (FNV-1a-ish). */
function hash(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** Pick a deterministic item from a list using a numeric seed. */
function pick<T>(list: T[], seed: number): T {
    return list[seed % list.length];
}

/**
 * Compute the per-scene editing plan. Deterministic: identical (preset, topic,
 * sceneCount) always produces the identical StylePlan.
 */
export function computeStylePlan(
    plan: { title: string; scenes: { sceneNumber: number; voiceoverText: string; durationSec?: number }[] },
    style: AgenticStyle = {},
): StylePlan {
    const preset = style.preset ?? 'cinematic';
    const seedBase = hash(plan.title + '|' + preset);

    // Preset tweaks: reels = punchy (more cuts/slides), documentary = calm (fades).
    const transitionPool: TransitionKind[] =
        preset === 'reels' ? ['slide', 'zoomblur', 'cut', 'fade'] :
        preset === 'documentary' || preset === 'documentary-cool' ? ['fade', 'slide', 'zoomblur'] :
        preset === 'neutral' ? ['fade'] :
        ['fade', 'slide', 'zoomblur']; // cinematic
    const gradePool: GradeKind[] =
        preset === 'documentary-cool' ? ['cool', 'cinematic', 'neutral'] :
        preset === 'reels' ? ['vivid', 'cinematic', 'warm'] :
        preset === 'neutral' ? ['neutral'] :
        ['cinematic', 'warm', 'cool', 'vivid'];

    const scenes: SceneStyle[] = plan.scenes.map((s, i) => {
        const seed = hash(plan.title + '|scene' + i + '|' + preset);
        const transitionIn: TransitionKind =
            i === 0 ? 'fade' :
            style.transitionBias?.[i] ?? pick(transitionPool, seed >> 3);
        const grade: GradeKind =
            style.gradeBias?.[i] ?? pick(gradePool, seed >> 7);

        const kinetic: KineticCue[] = [];
        if (style.kinetic !== false) {
            const dur = s.durationSec ?? 4;
            // Lower-third reveal at scene start (the scene's spoken hook).
            kinetic.push({ atSec: 0.15, text: s.voiceoverText.split(/[.!?]/)[0].slice(0, 60), kind: 'lowerthird' });
            // Word-pop on an emphasis word if present.
            const emph = ['secret', 'amazing', 'important', 'never', 'always', 'real', 'truth', 'best', 'worst']
                .find((w) => s.voiceoverText.toLowerCase().includes(w));
            if (emph) kinetic.push({ atSec: Math.max(0.4, dur * 0.45), text: emph.toUpperCase(), kind: 'wordpop' });
        }
        return { sceneIndex: i, transitionIn, grade, kinetic };
    });

    const transitions = scenes.map((sc) => sc.transitionIn);
    return { name: preset, transitions, scenes };
}

/**
 * Map a TransitionKind to an ffmpeg xfade transition name. IMPORTANT: this
 * static ffmpeg build (6.1.1-essentials) only implements a SUBSET of xfade
 * transitions — `fade` and the slide/wipe family work, but `zoomblur*` throws
 * "Not yet implemented in FFmpeg" (its const table isn't compiled in). So we
 * collapse zoomblur -> fade and keep slideleft as the only non-fade variant.
 */
export function xfadeName(kind: TransitionKind): string {
    switch (kind) {
        case 'slide': return 'slideleft';
        case 'zoomblur': return 'fade'; // zoomblur unsupported in this build
        case 'cut': return 'fade';      // renderer upgrades cuts to hard concat
        case 'fade':
        default: return 'fade';
    }
}

/**
 * Map a GradeKind to an ffmpeg `eq` filter string (cheap, no LUT file needed).
 * Only uses options that exist in ffmpeg's eq filter (contrast/brightness/
 * saturation/gamma) — `temperature` is NOT an eq option in this build, so warm/
 * cool looks are approximated via saturation + brightness instead.
 */
export function gradeFilter(kind: GradeKind): string {
    switch (kind) {
        case 'warm': return 'eq=contrast=1.05:brightness=1.04:saturation=1.22:gamma=0.96';
        case 'cool': return 'eq=contrast=1.0:brightness=0.97:saturation=1.08:gamma=1.05';
        case 'cinematic': return 'eq=contrast=1.12:brightness=0.97:saturation=1.1:gamma=0.95';
        case 'vivid': return 'eq=contrast=1.08:saturation=1.35:brightness=1.0';
        case 'neutral':
        default: return 'eq=contrast=1.02:saturation=1.05';
    }
}
