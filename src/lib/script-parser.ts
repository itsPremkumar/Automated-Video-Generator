import * as fs from 'fs';
import { resolveProjectPath } from '../runtime';
import { inputAssetPath } from './path-safety';

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
    /** Per-scene transition type override (e.g. 'fade', 'slide', 'zoomblur', 'cut'). */
    transition?: string;
    /** Per-scene color grade override (e.g. 'warm', 'cool', 'cinematic', 'vivid', 'neutral'). */
    grade?: string;
    /** Per-scene Ken Burns toggle. 'on' (default) or 'off'. */
    kenBurns?: string;
    /** Trim start time for local video clips (e.g. '00:05'). */
    trimStart?: string;
    /** Trim end time for local video clips (e.g. '00:10'). */
    trimEnd?: string;
    /** Caption position style ('top' | 'bottom' | 'center'). */
    captionStyle?: string;
    /** Caption text color override (e.g. 'white', 'yellow', 'blue'). */
    captionColor?: string;
    /** Audio fade-in duration in seconds (e.g. '0.5'). */
    fadeIn?: string;
    /** Audio fade-out duration in seconds (e.g. '0.5'). */
    fadeOut?: string;
    /** Per-scene voice override (e.g. 'en-US-GuyNeural'). */
    voiceOverride?: string;
    /** Per-scene background music file (e.g. 'bgm.mp3', in input/visuals/). */
    musicOverride?: string;
    /** Per-scene audio volume (0.0–1.0). */
    volumeOverride?: string;
    /** Per-scene caption theme preset (e.g. 'minimal', 'cinematic', 'neon'). */
    captionTheme?: string;
    /** Enable transition sound effects for this scene. */
    sfx?: boolean;
    /** J-cut for this scene: next scene's voiceover leads picture by N seconds. */
    jCutSec?: number;
    /** Enable cinematic vignette for this scene. */
    vignette?: boolean;
    /** Enable animated kinetic lower-third text for this scene. */
    kineticText?: boolean;
    /** Background music ducking depth for this scene. */
    musicIntensity?: 'calm' | 'mid' | 'energetic';
    /** Speech-timed caption cues (relative to scene start, ms) persisted from TTS. */
    captionSegments?: { text: string; startMs: number; endMs: number }[];
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
    'about',
    'after',
    'again',
    'also',
    'back',
    'been',
    'before',
    'being',
    'could',
    'each',
    'every',
    'first',
    'from',
    'give',
    'have',
    'here',
    'into',
    'just',
    'know',
    'like',
    'look',
    'make',
    'many',
    'more',
    'most',
    'much',
    'need',
    'only',
    'other',
    'over',
    'same',
    'should',
    'some',
    'such',
    'take',
    'than',
    'that',
    'their',
    'them',
    'then',
    'there',
    'these',
    'they',
    'thing',
    'this',
    'those',
    'through',
    'time',
    'very',
    'want',
    'well',
    'what',
    'when',
    'where',
    'which',
    'while',
    'will',
    'with',
    'work',
    'would',
    'year',
    'your',
    'free',
    'today',
    'already',
    'towards',
    'specifically',
    'question',
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
            // Split by sentence boundaries, but keep a trailing [Visual:...]/[Text:...]
            // tag attached to the sentence it belongs to (e.g. "Do X? [Visual: default.mp4]"
            // must stay one unit so the visual cue is not dropped). Only split when the
            // following char is not an opening bracket.
            const sentences = line.split(/(?<=[.?!])\s+(?!\[)/);
            for (const sentence of sentences) {
                const trimmed = sentence.trim();
                if (trimmed.length > 0) {
                    rawLines.push(trimmed);
                }
            }
        }
    }

    const lines = rawLines.filter((s) => s.length > 3); // Slightly lower threshold for short scripts

    const scenes: Scene[] = [];
    let pendingVisualCue = '';
    // Per-scene tag values (hoisted for trailing pending-visual scene at end of script)
    let sceneTransition: string | undefined;
    let sceneGrade: string | undefined;
    let sceneKenBurns: string | undefined;
    let sceneTrimStart: string | undefined;
    let sceneTrimEnd: string | undefined;
    let captionStyle: string | undefined;
    let captionColor: string | undefined;
    let fadeIn: string | undefined;
    let fadeOut: string | undefined;
    let voiceOverride: string | undefined;
    let musicOverride: string | undefined;
    let volumeOverride: string | undefined;
    let captionTheme: string | undefined;
    let sfx: boolean | undefined;
    let jCutSec: number | undefined;
    let sceneVignette: boolean | undefined;
    let sceneKineticText: boolean | undefined;
    let sceneMusicIntensity: 'calm' | 'mid' | 'energetic' | undefined;

    for (const line of lines) {
        const inlineTextMatch = line.match(/\[Text:?\s*(on|off)\]/is);
        const sceneShowText = inlineTextMatch ? inlineTextMatch[1].toLowerCase() === 'on' : undefined;

        // Per-scene inline tags
        const transitionMatch = line.match(/\[Transition:?\s*(fade|slide|zoomblur|cut)\]/is);
        sceneTransition = transitionMatch ? transitionMatch[1].toLowerCase() : undefined;
        const gradeMatch = line.match(/\[Grade:?\s*(neutral|warm|cool|cinematic|vivid)\]/is);
        sceneGrade = gradeMatch ? gradeMatch[1].toLowerCase() : undefined;
        const kenBurnsMatch = line.match(/\[KenBurns:?\s*(on|off|true|false)\]/is);
        sceneKenBurns = kenBurnsMatch ? (['on', 'true'].includes(kenBurnsMatch[1].toLowerCase()) ? 'on' : 'off') : undefined;
        const trimMatch = line.match(/\[Trim:?\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\]/is);
        sceneTrimStart = trimMatch?.[1] ?? undefined;
        sceneTrimEnd = trimMatch?.[2] ?? undefined;
        const styleMatch = line.match(/\[Style:?\s*(top|bottom|center)\]/is);
        captionStyle = styleMatch ? styleMatch[1].toLowerCase() : undefined;
        const colorMatch = line.match(/\[Color:?\s*(white|yellow|blue|red|green|cyan|magenta|black|pink|orange)\]/is);
        captionColor = colorMatch ? colorMatch[1].toLowerCase() : undefined;
        const fadeInMatch = line.match(/\[FadeIn:?\s*([\d.]+)\]/is);
        fadeIn = fadeInMatch ? fadeInMatch[1] : undefined;
        const fadeOutMatch = line.match(/\[FadeOut:?\s*([\d.]+)\]/is);
        fadeOut = fadeOutMatch ? fadeOutMatch[1] : undefined;
        const voiceMatch = line.match(/\[Voice:?\s*([^\]]+)\]/i);
        voiceOverride = voiceMatch ? voiceMatch[1].trim() : undefined;
        const musicMatch = line.match(/\[Music:?\s*([^\]]+)\]/i);
        musicOverride = musicMatch ? musicMatch[1].trim() : undefined;
        const volumeMatch = line.match(/\[Volume:?\s*([\d.]+)\]/is);
        volumeOverride = volumeMatch ? volumeMatch[1] : undefined;
        const captionThemeMatch = line.match(/\[CaptionTheme:?\s*([a-zA-Z0-9_-]+)\]/is);
        captionTheme = captionThemeMatch ? captionThemeMatch[1].toLowerCase() : undefined;
        const sfxMatch = line.match(/\[Sfx:?\s*(on|off|true|false)\]/is);
        sfx = sfxMatch ? (['on', 'true'].includes(sfxMatch[1].toLowerCase())) : undefined;
        const jCutMatch = line.match(/\[JCut:?\s*([\d.]+)\]/is);
        jCutSec = jCutMatch ? parseFloat(jCutMatch[1]) : undefined;
        const vignetteMatch = line.match(/\[Vignette:?\s*(on|off|true|false)\]/is);
        sceneVignette = vignetteMatch ? (['on', 'true'].includes(vignetteMatch[1].toLowerCase())) : undefined;
        const kineticMatch = line.match(/\[Kinetic:?\s*(on|off|true|false)\]/is);
        sceneKineticText = kineticMatch ? (['on', 'true'].includes(kineticMatch[1].toLowerCase())) : undefined;
        const musicIntensityMatch = line.match(/\[MusicIntensity:?\s*(calm|mid|energetic)\]/is);
        sceneMusicIntensity = musicIntensityMatch ? (musicIntensityMatch[1].toLowerCase() as 'calm' | 'mid' | 'energetic') : undefined;

        const cleanText = line
            .replace(/\[Visual:?\s*.*?\]/gis, '')
            .replace(/\[Text:?\s*.*?\]/gis, '')
            .replace(/\[Transition:?\s*.*?\]/gis, '')
            .replace(/\[Grade:?\s*.*?\]/gis, '')
            .replace(/\[KenBurns:?\s*.*?\]/gis, '')
            .replace(/\[Trim:?\s*.*?\]/gis, '')
            .replace(/\[Style:?\s*.*?\]/gis, '')
            .replace(/\[Color:?\s*.*?\]/gis, '')
            .replace(/\[FadeIn:?\s*.*?\]/gis, '')
            .replace(/\[FadeOut:?\s*.*?\]/gis, '')
            .replace(/\[Voice:?\s*.*?\]/gis, '')
            .replace(/\[Music:?\s*.*?\]/gis, '')
            .replace(/\[Volume:?\s*.*?\]/gis, '')
            .replace(/\[CaptionTheme:?\s*.*?\]/gis, '')
            .replace(/\[Sfx:?\s*.*?\]/gis, '')
            .replace(/\[JCut:?\s*.*?\]/gis, '')
            .replace(/\[Vignette:?\s*.*?\]/gis, '')
            .replace(/\[Kinetic:?\s*.*?\]/gis, '')
            .replace(/\[MusicIntensity:?\s*.*?\]/gis, '')
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
                    localAsset: fs.existsSync(inputAssetPath(tag)) ? tag : undefined,
                    showText: false,
                    transition: sceneTransition,
                    grade: sceneGrade,
                    kenBurns: sceneKenBurns,
                    trimStart: sceneTrimStart,
                    trimEnd: sceneTrimEnd,
            captionTheme,
            sfx,
            jCutSec,
            vignette: sceneVignette,
            kineticText: sceneKineticText,
            musicIntensity: sceneMusicIntensity,
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
                localAsset: fs.existsSync(inputAssetPath(pendingVisualCue)) ? pendingVisualCue : undefined,
                showText: false,
                transition: sceneTransition,
                grade: sceneGrade,
                kenBurns: sceneKenBurns,
                trimStart: sceneTrimStart,
                trimEnd: sceneTrimEnd,
            captionTheme,
            sfx,
            jCutSec,
            vignette: sceneVignette,
            kineticText: sceneKineticText,
            musicIntensity: sceneMusicIntensity,
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
        const allWords = cleanText
            .toLowerCase()
            .replace(/[.,?!#+'%]/g, '')
            .split(/\s+/);
        const filteredWords = allWords.filter((w) => w.length > 3 && !STOP_WORDS.has(w));

        let keywords: string[] = [];
        let visualDescription = '';
        let localAsset: string | undefined = undefined;

        const effectiveVisual = visualCue || pendingVisualCue;

        if (effectiveVisual) {
            keywords = effectiveVisual.toLowerCase().split(/\s+/).filter(Boolean);
            visualDescription = `Visual for: ${effectiveVisual}`;
            if (fs.existsSync(inputAssetPath(effectiveVisual))) {
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
            showText: sceneShowText,
            transition: sceneTransition,
            grade: sceneGrade,
            kenBurns: sceneKenBurns,
            trimStart: sceneTrimStart,
            trimEnd: sceneTrimEnd,
            captionTheme,
            sfx,
            jCutSec,
            vignette: sceneVignette,
            kineticText: sceneKineticText,
            musicIntensity: sceneMusicIntensity,
            captionStyle,
            captionColor,
            fadeIn,
            fadeOut,
        });
    }

    // Handle remaining pending visual cue
    if (pendingVisualCue) {
        const keywords = pendingVisualCue.toLowerCase().split(/\s+/).filter(Boolean);
        const visualDescription = `Visual for: ${pendingVisualCue}`;
        let localAsset: string | undefined = undefined;

        if (fs.existsSync(inputAssetPath(pendingVisualCue))) {
            localAsset = pendingVisualCue;
        }

        scenes.push({
            sceneNumber: scenes.length + 1,
            duration: 5,
            visualDescription,
            voiceoverText: '',
            searchKeywords: keywords,
            localAsset,
            showText: false,
            transition: sceneTransition,
            grade: sceneGrade,
            kenBurns: sceneKenBurns,
            trimStart: sceneTrimStart,
            trimEnd: sceneTrimEnd,
            captionTheme,
            sfx,
            jCutSec,
            vignette: sceneVignette,
            kineticText: sceneKineticText,
            musicIntensity: sceneMusicIntensity,
            captionStyle,
            captionColor,
            fadeIn,
            fadeOut,
        });
    }

    const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);

    return {
        scenes,
        totalDuration,
        videoStyle: 'professional',
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
