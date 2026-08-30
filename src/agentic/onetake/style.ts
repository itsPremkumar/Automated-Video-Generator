/**
 * style.ts — Pick a coherent director's intent for the whole video.
 *
 * The agentic pipeline currently picks a grade per scene independently,
 * which leads to visual whiplash. This module picks ONE grade, ONE
 * transition, ONE caption theme for the entire video based on:
 *   1. The topic's emotional valence (research-derived)
 *   2. The user's --forceGrade override (if given)
 *   3. The orientation's platform expectations (TikTok → vivid, YouTube → neutral)
 */
import { logInfo } from '../../shared/logging/runtime-logging.js';
import type { StyleIntent } from './types.js';
import type { ResearchFact } from './types.js';

interface GradePreset {
    grade: string;
    valence: string[];
    description: string;
}

interface TransitionPreset {
    name: string;
    description: string;
}

// IMPORTANT: These values MUST match the regex vocabulary in
// src/lib/script-parser.ts (gradeMatch, transitionMatch, kineticMatch).
const GRADE_PRESETS: GradePreset[] = [
    { grade: 'cinematic', valence: ['dramatic', 'intense', 'epic', 'awe'], description: 'Deep shadows, warm highlights, letterbox' },
    { grade: 'vivid', valence: ['bright', 'colorful', 'fun', 'energy'], description: 'High saturation, punchy contrast' },
    { grade: 'warm', valence: ['warm', 'cozy', 'nostalgia', 'sunset', 'calm', 'soft', 'peaceful'], description: 'Golden-hour warmth, soft contrast' },
    { grade: 'cool', valence: ['tech', 'science', 'future', 'cold'], description: 'Cool shadows, crisp highlights' },
    { grade: 'neutral', valence: ['tutorial', 'education', 'explainer', 'natural', 'calm', 'soft', 'peaceful'], description: 'No grade, clean broadcast look' },
    { grade: 'sunset', valence: ['sunset', 'golden', 'hour', 'dawn', 'dusk'], description: 'Warm sunset grade, orange tint' },
    { grade: 'cyberpunk', valence: ['cyber', 'neon', 'synth', 'wave', 'retro', 'future'], description: 'Neon-tinted, high-tech grade' },
    { grade: 'noir', valence: ['mystery', 'thriller', 'dark', 'crime'], description: 'High contrast B&W, dramatic shadows' },
];

// Transition names must match the transitionMatch regex in script-parser.ts
const TRANSITION_PRESETS: TransitionPreset[] = [
    { name: 'cut', description: 'Hard cut — fast, punchy' },
    { name: 'fade', description: 'Gentle dissolve — calm, flowing' },
    { name: 'slide', description: 'Slide left → right — tutorial rhythm' },
    { name: 'whippan', description: 'Whip pan — energetic, dynamic' },
    { name: 'dissolve', description: 'Smooth dissolve — cinematic' },
    { name: 'glitch', description: 'Glitch transition — tech/energy' },
];

const CAPTION_PRESETS = [
    { theme: 'karaoke', description: 'Word-by-word karaoke highlight' },
    { theme: 'burned', description: 'Burned-in subtitle box' },
    { theme: 'pop', description: 'Pop-in word animation' },
    { theme: 'none', description: 'No captions' },
];

/**
 * Pick a style based on topic valence.
 * Uses word matching against the topic, research snippets, and orientation.
 */
export function pickStyleIntent(
    topic: string,
    facts: ResearchFact[],
    orientation: 'portrait' | 'landscape' | 'square',
    forceGrade?: string,
): StyleIntent {
    const text = `${topic} ${facts.map(f => `${f.title} ${f.snippet}`).join(' ')}`.toLowerCase();

    if (forceGrade) {
        const preset = GRADE_PRESETS.find(p => p.grade === forceGrade) ?? GRADE_PRESETS.find(p => p.grade === 'neutral')!;
        return {
            grade: preset.grade,
            transition: orientation === 'portrait' ? 'cut' : 'slide',
            kinetic: orientation === 'portrait',
            captionTheme: 'burned',
            rationale: `User forced grade "${forceGrade}" — ${preset.description}`,
        };
    }

    // Score each grade preset against the topic text
    let bestGrade: GradePreset = GRADE_PRESETS.find(p => p.grade === 'neutral')!;
    let bestScore = 0;

    for (const preset of GRADE_PRESETS) {
        let score = 0;
        for (const v of preset.valence) {
            if (text.includes(v)) score++;
        }
        if (score > bestScore) {
            bestScore = score;
            bestGrade = preset;
        }
    }

    // Pick transition based on orientation + grade mood
    let transition = TRANSITION_PRESETS.find(t => t.name === 'cut')!;
    if (orientation === 'portrait' && bestGrade.grade === 'vivid') {
        transition = TRANSITION_PRESETS.find(t => t.name === 'cut')!;
    } else if (orientation === 'landscape' && ['cinematic', 'warm', 'noir'].includes(bestGrade.grade)) {
        transition = TRANSITION_PRESETS.find(t => t.name === 'dissolve')!;
    } else if (orientation === 'landscape' && bestGrade.grade === 'neutral') {
        transition = TRANSITION_PRESETS.find(t => t.name === 'slide')!;
    }

    // Pick kinetic text style based on orientation
    const kinetic = orientation === 'portrait'; // portrait → kinetic on, landscape → static

    // Pick caption theme
    const captionTheme = orientation === 'portrait' ? 'burned' : 'karaoke';

    const rationale = `Topic scored for "${bestGrade.grade}" (${bestGrade.description}). ` +
        `Orientation=${orientation} → ${transition.name} transition, ${kinetic ? 'kinetic' : 'static'} text.`;

    logInfo(`[ONETAKE] Style intent: ${bestGrade.grade} / ${transition.name} / ${kinetic ? 'kinetic' : 'static'} — ${rationale}`);

    return {
        grade: bestGrade.grade,
        transition: transition.name,
        kinetic,
        captionTheme,
        rationale,
    };
}