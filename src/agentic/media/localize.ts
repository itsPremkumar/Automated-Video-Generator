/**
 * localize.ts — multi-language subtitle sidecars (Tier-1 #2).
 *
 * After the final video + its native-language SRT are produced, this module
 * generates TRANSLATED .srt sidecars for every requested language, so the same
 * render ships with subtitles in many languages (great for reach on YouTube /
 * global platforms). Zero-cost + offline-safe:
 *
 *   - Translation uses the SAME free model the agent already uses (AgentBrain),
 *     via a structured JSON call. No paid translation API.
 *   - If no model is configured / the call fails / budget is exhausted, the
 *     line falls back to the ORIGINAL text (so a sidecar is always produced,
 *     just untranslated) — never blocks the pipeline.
 *
 * Only the `text` of each cue is translated; timing is preserved exactly.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Caption, parseSrt, serializeSrt } from '@remotion/captions';
import type { AgentBrain } from '../ai/brain.js';

export interface LocalizeOptions {
    /** Path to the source (native-language) .srt sidecar. */
    srcSrtPath: string;
    /** Output directory for the translated sidecars. */
    outDir: string;
    /** Base filename (without extension) for the sidecars, e.g. "job_123". */
    baseName: string;
    /** Target language codes/names, e.g. ["es","fr","hi","ta"]. */
    languages: string[];
    /** The agent brain (used only if a free model is configured). */
    brain: AgentBrain;
}

/** Translate a single line. Returns the original text on any failure/offline. */
async function translateLine(line: string, lang: string, brain: AgentBrain): Promise<string> {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (!brain.modelEnabled) return line; // no model → keep original (offline-safe)
    try {
        const r = await brain.completeJSON<{ translation: string }>(
            'You are a precise subtitle translator. Translate the line into the target language. Keep it short, keep punctuation, do NOT add explanations.',
            `Target language: ${lang}\nLine: ${trimmed}`,
            '{"translation":"..."}',
        );
        if (r && r.translation && r.translation.trim()) return r.translation.trim();
    } catch {
        /* fall through to original */
    }
    return line;
}

/**
 * Produce one translated .srt sidecar per language.
 * Returns the list of written file paths (empty if src missing / no languages).
 */
export async function localizeSrtSidecars(opts: LocalizeOptions): Promise<string[]> {
    const { srcSrtPath, outDir, baseName, languages, brain } = opts;
    const written: string[] = [];
    if (!languages.length) return written;
    if (!fs.existsSync(srcSrtPath)) return written;

    let captions: Caption[];
    try {
        const parsed = parseSrt({ input: fs.readFileSync(srcSrtPath, 'utf8') });
        captions = parsed.captions as Caption[];
    } catch {
        return written;
    }
    if (!captions.length) return written;

    fs.mkdirSync(outDir, { recursive: true });

    for (const lang of languages) {
        const translated: Caption[] = [];
        for (const c of captions) {
            const t = await translateLine(c.text, lang, brain);
            translated.push({ ...c, text: t });
        }
        const outPath = path.join(outDir, `${baseName}.${lang}.srt`);
        fs.writeFileSync(outPath, serializeSrt({ lines: translated.map((c) => [c]) }));
        written.push(outPath);
    }
    return written;
}
