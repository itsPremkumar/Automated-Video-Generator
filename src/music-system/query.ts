/**
 * src/music-system/query.ts
 * MusicQuery builder — topic + voiceover → structured query.
 */

import type { MusicQuery, MusicMood, MusicIntensity, MusicRole } from './types';

/** Mood → genre mapping for keyword-less topic analysis */
const MOOD_GENRE_MAP: Record<MusicMood, string[]> = {
    calm: ['ambient', 'piano', 'meditation', 'nature', 'peaceful', 'soft'],
    upbeat: ['energetic', 'happy', 'pop', 'dance', 'workout', 'optimistic'],
    dramatic: ['cinematic', 'epic', 'orchestral', 'emotional', 'trailer', 'suspense'],
    professional: ['corporate', 'documentary', 'presentation', 'clean', 'inspirational'],
    nostalgic: ['lofi', 'chill', 'retro', 'jazz', 'vinyl', 'slow'],
    dark: ['ambient-drone', 'minimal', 'dark', 'noir', 'mysterious', 'tense'],
    any: ['ambient', 'cinematic', 'lofi'],
};

/** Topic keywords that suggest a specific mood */
const TOPIC_MOOD_HINTS: Record<string, MusicMood> = {
    // Calm
    meditation: 'calm',
    yoga: 'calm',
    relaxation: 'calm',
    sleep: 'calm',
    nature: 'calm',
    calm: 'calm',
    peaceful: 'calm',
    // Upbeat
    workout: 'upbeat',
    exercise: 'upbeat',
    dance: 'upbeat',
    party: 'upbeat',
    energy: 'upbeat',
    happy: 'upbeat',
    motivation: 'upbeat',
    // Dramatic
    epic: 'dramatic',
    action: 'dramatic',
    adventure: 'dramatic',
    emotional: 'dramatic',
    inspiring: 'dramatic',
    // Professional
    business: 'professional',
    corporate: 'professional',
    tech: 'professional',
    tutorial: 'professional',
    educational: 'professional',
    // Nostalgic
    lofi: 'nostalgic',
    retro: 'nostalgic',
    vintage: 'nostalgic',
    jazz: 'nostalgic',
    chill: 'nostalgic',
    // Dark
    horror: 'dark',
    mystery: 'dark',
    suspense: 'dark',
    thriller: 'dark',
};

export function detectMood(topic: string, voiceoverText?: string): MusicMood {
    const combined = `${topic} ${voiceoverText || ''}`.toLowerCase();

    // Check each hint word
    for (const [keyword, mood] of Object.entries(TOPIC_MOOD_HINTS)) {
        if (combined.includes(keyword)) return mood;
    }

    return 'calm'; // safe default
}

export function detectIntensity(topic: string, mood: MusicMood): MusicIntensity {
    const combined = topic.toLowerCase();
    const highWords = ['epic', 'intense', 'powerful', 'extreme', 'action', 'workout'];
    const lowWords = ['calm', 'gentle', 'soft', 'peaceful', 'meditation', 'sleep', 'relax'];

    for (const w of highWords) if (combined.includes(w)) return 'high';
    for (const w of lowWords) if (combined.includes(w)) return 'low';
    if (mood === 'calm' || mood === 'nostalgic') return 'low';
    if (mood === 'dramatic') return 'high';
    return 'mid';
}

/** Extract the top N significant keywords from a phrase */
function extractKeywords(text: string, maxWords = 5): string[] {
    const stopWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
        'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
        'as', 'into', 'through', 'during', 'before', 'after', 'above',
        'below', 'between', 'out', 'off', 'over', 'under', 'again',
        'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
        'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
        'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
        'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or',
        'if', 'while', 'that', 'this', 'these', 'those', 'it', 'its',
    ]);

    const words = text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));

    // Count frequency
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);

    // Sort by frequency (desc), return top N
    return [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxWords)
        .map(([w]) => w);
}

/** Build a full MusicQuery from minimal inputs */
export function buildMusicQuery(opts: {
    topic?: string;
    voiceoverText?: string;
    mood?: MusicMood;
    role?: MusicRole;
    targetDurationSec?: number;
    minDurationSec?: number;
    intensity?: MusicIntensity;
    preferredGenres?: string[];
}): MusicQuery {
    const mood = opts.mood || detectMood(opts.topic || '', opts.voiceoverText);
    const intensity = opts.intensity || detectIntensity(opts.topic || '', mood);
    const keyWords = extractKeywords(`${opts.topic || ''} ${opts.voiceoverText || ''}`);

    const preferredGenres = opts.preferredGenres?.length
        ? opts.preferredGenres
        : MOOD_GENRE_MAP[mood];

    return {
        mood,
        topic: opts.topic,
        voiceoverText: opts.voiceoverText,
        targetDurationSec: opts.targetDurationSec || 60,
        minDurationSec: opts.minDurationSec || 30,
        intensity,
        preferredGenres,
        role: opts.role || 'background',
    };
}
