import * as fs from 'fs';
import { resolveProjectPath } from '../runtime';

export interface Scene {
    sceneNumber: number;
    duration: number;
    visualDescription: string;
    voiceoverText: string;
    searchKeywords: string[];
    localAsset?: string;
    showText?: boolean;
    voiceConfig?: {
        voice?: string;
        pitch?: number;
        rate?: number;
    };
    audioPath?: string;
    visual?: {
        type: 'video' | 'image';
        url: string;
        localPath: string;
        videoDuration?: number;
    };
}

export interface ParsedScript {
    scenes: Scene[];
    totalDuration: number;
    videoStyle: 'professional' | 'casual' | 'energetic';
}

// Common stop words to filter out for better keyword extraction
const STOP_WORDS = new Set([
    'about', 'after', 'again', 'also', 'back', 'been', 'before', 'being',
    'could', 'each', 'every', 'first', 'from', 'give', 'have', 'here',
    'into', 'just', 'know', 'like', 'look', 'make', 'many', 'more',
    'most', 'much', 'need', 'only', 'other', 'over', 'same', 'should',
    'some', 'such', 'take', 'than', 'that', 'their', 'them', 'then',
    'there', 'these', 'they', 'thing', 'this', 'those', 'through', 'time',
    'very', 'want', 'well', 'what', 'when', 'where', 'which', 'while',
    'will', 'with', 'work', 'would', 'year', 'your', 'free', 'today',
    'already', 'towards', 'specifically', 'question'
]);

/**
 * Parse a script into scenes using local parsing
 * Simple, fast, no API calls required
 */
export async function parseScript(script: string): Promise<ParsedScript> {
    const startTime = Date.now();
    const result = parseScriptLocally(script);
    return result;
}

/**
 * Simple local parser that doesn't need AI
 * Breaks text by newlines/periods and extracts keywords
 */
function parseScriptLocally(script: string): ParsedScript {
    const rawLines: string[] = [];

    // First split by paragraphs
    const paragraphs = script.split(/\n\s*\n/);

    for (const para of paragraphs) {
        // Split by single newlines
        const lines = para.split('\n');
        for (const line of lines) {
            // Split by sentence boundaries, but respect bracketed tags
            const sentences = line.split(/(?<=[.?!])\s+(?![^\[]*\])/);
            for (const sentence of sentences) {
                const trimmed = sentence.trim();
                if (trimmed.length > 0) {
                    rawLines.push(trimmed);
                }
            }
        }
    }

    const lines = rawLines.filter(s => s.length > 3); // Slightly lower threshold for short scripts

    const scenes: Scene[] = [];
    let pendingVisualCue = '';

    for (const line of lines) {
        const inlineTextMatch = line.match(/\[Text:?\s*(on|off)\]/is);
        const sceneShowText = inlineTextMatch ? inlineTextMatch[1].toLowerCase() === 'on' : undefined;

        const cleanText = line
            .replace(/\[Visual:?\s*.*?\]/gis, '')
            .replace(/\[Text:?\s*.*?\]/gis, '')
            .trim();

        // Find all visual matches in the line
        const visualMatches = [...line.matchAll(/\[Visual:?\s*(.*?)\]/gis)];
        
        // FEATURE: If we have multiple visual tags on one line and NO text, split them evenly
        if (visualMatches.length > 1 && !cleanText) {
            for (const match of visualMatches) {
                const tag = match[1].trim();
                const keywords = tag.toLowerCase().split(/\s+/).filter(Boolean);
                scenes.push({
                    sceneNumber: scenes.length + 1,
                    duration: 5,
                    visualDescription: `Visual for: ${tag}`,
                    voiceoverText: '',
                    searchKeywords: keywords,
                    localAsset: fs.existsSync(resolveProjectPath('input', 'input-assests', tag)) ? tag : undefined,
                    showText: false
                });
            }
            pendingVisualCue = '';
            continue;
        }

        const visualCue = visualMatches[0]?.[1]?.trim() || '';

        // If we have a visual cue but no text, and we already HAD a pending visual cue,
        // it means the previous tag was also on its own line. Let's make it a scene.
        if (!cleanText && visualCue && pendingVisualCue) {
            const keywords = pendingVisualCue.toLowerCase().split(/\s+/).filter(Boolean);
            scenes.push({
                sceneNumber: scenes.length + 1,
                duration: 5,
                visualDescription: `Visual for: ${pendingVisualCue}`,
                voiceoverText: '',
                searchKeywords: keywords,
                localAsset: fs.existsSync(resolveProjectPath('input', 'input-assests', pendingVisualCue)) ? pendingVisualCue : undefined,
                showText: false
            });
            pendingVisualCue = visualCue;
            continue;
        }

        if (!cleanText) {
            if (visualCue) {
                pendingVisualCue = visualCue;
            }
            continue;
        }

        // Scene generation from text and visual cue
        const allWords = cleanText.toLowerCase().replace(/[.,?!#+'%]/g, '').split(/\s+/);
        const filteredWords = allWords.filter(w => w.length > 3 && !STOP_WORDS.has(w));

        let keywords: string[] = [];
        let visualDescription = '';
        let localAsset: string | undefined = undefined;

        const effectiveVisual = visualCue || pendingVisualCue;

        if (effectiveVisual) {
            keywords = effectiveVisual.toLowerCase().split(/\s+/).filter(Boolean);
            visualDescription = `Visual for: ${effectiveVisual}`;
            if (fs.existsSync(resolveProjectPath('input', 'input-assests', effectiveVisual))) {
                localAsset = effectiveVisual;
            }
            pendingVisualCue = ''; 
        } else {
            keywords = filteredWords.slice(0, 4);
            if (keywords.length === 0) keywords.push('business', 'professional');
            visualDescription = `Visual for: ${keywords.join(' ')}`;
        }

        const duration = Math.max(3, Math.ceil(cleanText.length / 15));

        scenes.push({
            sceneNumber: scenes.length + 1,
            duration,
            visualDescription,
            voiceoverText: cleanText,
            searchKeywords: keywords,
            localAsset,
            showText: sceneShowText
        });
    }

    // Handle remaining pending visual cue
    if (pendingVisualCue) {
        const keywords = pendingVisualCue.toLowerCase().split(/\s+/).filter(Boolean);
        const visualDescription = `Visual for: ${pendingVisualCue}`;
        let localAsset: string | undefined = undefined;
        
        if (fs.existsSync(resolveProjectPath('input', 'input-assests', pendingVisualCue))) {
            localAsset = pendingVisualCue;
        }

        scenes.push({
            sceneNumber: scenes.length + 1,
            duration: 5,
            visualDescription,
            voiceoverText: '',
            searchKeywords: keywords,
            localAsset,
            showText: false
        });
    }

    const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);

    return {
        scenes,
        totalDuration,
        videoStyle: 'professional'
    };
}

/**
 * Validate that a script has the minimum required content
 */
export function validateScript(script: string, allowEmpty: boolean = false): void {
    if (!script || script.trim().length === 0) {
        if (allowEmpty) return;
        throw new Error('Script cannot be empty');
    }

    const trimmedLength = script.trim().length;

    if (trimmedLength < 10) {
        if (allowEmpty || script.includes('[Visual:')) return;
        throw new Error('Script is too short (minimum 10 characters)');
    }

    if (trimmedLength > 5000) {
        throw new Error('Script is too long (maximum 5000 characters)');
    }
}
