import * as fs from 'fs';
import * as path from 'path';

export interface Scene {
    sceneNumber: number;
    duration: number;
    visualDescription: string;
    voiceoverText: string;
    searchKeywords: string[];
    localAsset?: string;
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
    // console.log('\n📝 [PARSER] Starting script parsing...');
    // console.log(`📝 [PARSER] Script length: ${script.length} characters`);
    // console.log(`📝 [PARSER] Script preview: "${script.substring(0, 100)}..."`);

    const startTime = Date.now();
    const result = parseScriptLocally(script);
    const elapsed = Date.now() - startTime;

    // console.log(`📝 [PARSER] Parsing completed in ${elapsed}ms`);
    return result;
}

/**
 * Simple local parser that doesn't need AI
 * Breaks text by newlines/periods and extracts keywords
 */
function parseScriptLocally(script: string): ParsedScript {
    // console.log('📝 [PARSER] Splitting script by sentences...');

    // Split by newlines first, then by periods ONLY if followed by space or end
    // This prevents splitting URLs like "example.com"
    const rawLines: string[] = [];

    // First split by double newlines (paragraphs)
    const paragraphs = script.split(/\n\s*\n/);

    for (const para of paragraphs) {
        // Split by single newlines
        const lines = para.split('\n');
        for (const line of lines) {
            // Split by periods/questions/exclamations followed by space or end (sentence boundaries)
            // But NOT punctuation in the middle of words (URLs, abbreviations)
            const sentences = line.split(/(?<=[.?!])\s+/);
            for (const sentence of sentences) {
                const trimmed = sentence.trim();
                if (trimmed.length > 0) {
                    rawLines.push(trimmed);
                }
            }
        }
    }

    // console.log(`📝 [PARSER] Raw sentences found: ${rawLines.length}`);

    const lines = rawLines.filter(s => s.length > 5); // Ignore very short fragments

    // console.log(`📝 [PARSER] Valid lines after filtering (>10 chars): ${lines.length}`);
    // console.log('📝 [PARSER] Processing each line into scenes...\n');

    const scenes: Scene[] = lines.map((line, index) => {
        // console.log(`  📝 [SCENE ${index + 1}] Processing: "${line.substring(0, 50)}..."`);

        // CHECK FOR MANUAL VISUAL CUES: [Visual: A happy dog running]
        let visualCue = '';
        let cleanText = line;
        let localAsset: string | undefined = undefined;

        const visualMatch = line.match(/\[Visual:?\s*(.*?)\]/i);
        if (visualMatch) {
            visualCue = visualMatch[1].trim();
            // Remove ALL cues from the spoken text (global replace)
            cleanText = line.replace(/\[Visual:?\s*.*?\]/gi, '').trim();
        }

        // Better keyword extraction with stop words filter
        const allWords = cleanText
            .toLowerCase()
            .replace(/[.,?!#+'%]/g, '')
            .split(/\s+/);

        const filteredWords = allWords.filter(w => w.length > 3 && !STOP_WORDS.has(w));

        // Strategy: Use Visual Cue if present, otherwise use keywords
        let keywords: string[] = [];
        let visualDescription = '';

        if (visualCue) {
            // If user provided a cue, use it directly!
            // We split it into keywords for the search function, but keep the full phrase for context
            keywords = visualCue.toLowerCase().split(/\s+/);
            visualDescription = `Visual for: ${visualCue}`; // User's exact prompt

            // Check if it's a local asset
            const assetsDir = path.join(process.cwd(), 'input', 'input-assests');
            if (fs.existsSync(path.join(assetsDir, visualCue))) {
                localAsset = visualCue;
            }
        } else {
            keywords = filteredWords.slice(0, 4); // Take top 4 keywords
            if (keywords.length === 0) {
                keywords.push('business', 'professional');
            }
            visualDescription = `Visual for: ${keywords.join(' ')}`;
        }

        const duration = Math.max(3, Math.ceil(cleanText.length / 15));

        // console.log(`  📝 [SCENE ${index + 1}] Keywords: [${keywords.join(', ')}]`);
        // console.log(`  📝 [SCENE ${index + 1}] Duration: ${duration}s (based on ${cleanText.length} chars)`);
        // console.log('');

        return {
            sceneNumber: index + 1,
            duration,
            visualDescription: `Visual for: ${keywords.join(' ')}`,
            voiceoverText: cleanText,
            searchKeywords: keywords,
            localAsset
        };
    });

    const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);

    // console.log('📝 [PARSER] ═══════════════════════════════════════');
    // console.log(`📝 [PARSER] ✅ Parsing Summary:`);
    // console.log(`📝 [PARSER]    Total scenes: ${scenes.length}`);
    // console.log(`📝 [PARSER]    Total duration: ${totalDuration}s`);
    // console.log(`📝 [PARSER]    Avg scene duration: ${(totalDuration / scenes.length).toFixed(1)}s`);
    // console.log('📝 [PARSER] ═══════════════════════════════════════\n');

    return {
        scenes,
        totalDuration,
        videoStyle: 'professional'
    };
}

/**
 * Validate that a script has the minimum required content
 */
export function validateScript(script: string): void {
    // console.log('\n📋 [VALIDATOR] Starting script validation...');
    // console.log(`📋 [VALIDATOR] Input type: ${typeof script}`);
    // console.log(`📋 [VALIDATOR] Input length: ${script?.length || 0} characters`);

    if (!script || script.trim().length === 0) {
        // console.error('📋 [VALIDATOR] ❌ FAILED: Script is empty');
        throw new Error('Script cannot be empty');
    }
    // console.log('📋 [VALIDATOR] ✓ Script is not empty');

    const trimmedLength = script.trim().length;
    // console.log(`📋 [VALIDATOR] Trimmed length: ${trimmedLength} characters`);

    if (trimmedLength < 10) {
        // console.error(`📋 [VALIDATOR] ❌ FAILED: Script too short (${trimmedLength} < 10)`);
        throw new Error('Script is too short (minimum 10 characters)');
    }
    // console.log('📋 [VALIDATOR] ✓ Script length >= 10 characters');

    if (trimmedLength > 5000) {
        // console.error(`📋 [VALIDATOR] ❌ FAILED: Script too long (${trimmedLength} > 5000)`);
        throw new Error('Script is too long (maximum 5000 characters)');
    }
    // console.log('📋 [VALIDATOR] ✓ Script length <= 5000 characters');

    // console.log('📋 [VALIDATOR] ✅ Script validation PASSED\n');
}

