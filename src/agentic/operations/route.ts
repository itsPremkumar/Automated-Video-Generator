/**
 * route.ts — natural-language intent router.
 *
 * The user says ONE plain sentence ("merge these two videos", "give me a
 * voiceover of this text", "crop to 9:16", "make me a full video about cats").
 * The router classifies it into a SINGLE task and returns a structured plan
 * describing which operation to run and with what arguments. It does NOT execute
 * anything — the caller (MCP tool / agent) runs only the chosen op.
 *
 * Design rule (project constraint): ZERO-COST, NO paid key. Classification is
 * KEYWORD-HEURISTIC FIRST. An optional free model (AgentBrain) may be used to
 * refine extracted arguments, but the router MUST work fully offline with no
 * model configured (heuristic fallback always returns a valid task).
 */

import { AgentBrain } from '../brain.js';

export type TaskKind =
    | 'merge'
    | 'trim'
    | 'crop'
    | 'resize'
    | 'rotate'
    | 'extract_audio'
    | 'voiceover'
    | 'download_image'
    | 'download_video'
    | 'full_video'
    | 'unknown';

export interface RoutedTask {
    kind: TaskKind;
    /** Human-readable summary of what will run. */
    summary: string;
    /** Parsed arguments for the op. */
    args: Record<string, any>;
    /** Confidence 0-1 (heuristic = high when keywords match). */
    confidence: number;
}

const STOP = new Set([
    'a', 'an', 'the', 'of', 'for', 'to', 'and', 'or', 'in', 'on', 'with', 'about', 'from', 'into', 'my', 'me', 'please', 'can', 'you', 'could',
]);

/** Pull a quoted or trailing phrase that looks like the "text/keyword" payload. */
function extractPhrase(text: string): string {
    const quoted = text.match(/["'“]([^"'"”]+)["'”]/);
    if (quoted) return quoted[1].trim();
    // "about X" / "for X" / "of X"
    const about = text.match(/\b(?:about|for|of|named?|called)\s+([^.]{3,200})$/i);
    if (about) return about[1].trim();
    return '';
}

/** Pull "N seconds" / "from 10 to 20" / "10-20s" style time spans. */
function extractTimes(text: string): { start?: number; end?: number } {
    const range = text.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?/i);
    if (range) return { start: parseFloat(range[1]), end: parseFloat(range[2]) };
    const start = text.match(/\b(?:from|start(?:ing)?\s*at)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?/i);
    const end = text.match(/\b(?:to|until|end(?:ing)?\s*at)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?/i);
    return {
        start: start ? parseFloat(start[1]) : 0,
        end: end ? parseFloat(end[1]) : undefined,
    };
}

/** Find file paths / names mentioned in the text. */
function extractPaths(text: string): string[] {
    const paths = text.match(/(\.?\/)?(?:[\w .-]+\/)*[\w.-]+\.(mp4|mov|webm|m4v|mp3|wav|jpg|jpeg|png|webp)/gi);
    if (paths) return paths.map((p) => p.trim());
    // bare "clip1 and clip2" style handled by caller via args
    return [];
}

export function routeTask(prompt: string, brain?: AgentBrain): RoutedTask {
    const t = prompt.toLowerCase();

    // ── DOWNLOAD (image/video by keyword) ──
    if (/\b(download|get|fetch|give me|find|search)\b/.test(t) && /\b(image|photo|picture|pic)\b/.test(t)) {
        const kw = extractPhrase(t) || t.replace(/.*?(image|photo|picture|pic|of)\s*/i, '').replace(/\b(download|get|fetch|give me|find|search|please|for me)\b/gi, '').trim();
        return { kind: 'download_image', summary: `Download a free image for "${kw}"`, args: { keyword: kw }, confidence: 0.9 };
    }
    if (/\b(download|get|fetch|give me|find|search)\b/.test(t) && /\b(video|footage|clip)\b/.test(t) && !/\bmerge|combine|join\b/.test(t)) {
        const kw = extractPhrase(t) || t.replace(/.*?(video|footage|clip|of)\s*/i, '').replace(/\b(download|get|fetch|give me|find|search|please|for me)\b/gi, '').trim();
        return { kind: 'download_video', summary: `Download a free video for "${kw}"`, args: { keyword: kw }, confidence: 0.9 };
    }

    // ── MERGE ──
    if (/\b(merge|combine|join|concat|put together|stitch)\b/.test(t) && /\b(video|clip|footage|together)\b/.test(t)) {
        const paths = extractPaths(t);
        return {
            kind: 'merge',
            summary: paths.length >= 2 ? `Merge ${paths.length} videos` : 'Merge provided videos',
            args: { files: paths.length ? paths : undefined },
            confidence: 0.95,
        };
    }

    // ── TRIM ──
    if (/\b(trim|cut|shorten|slice)\b/.test(t)) {
        const { start, end } = extractTimes(t);
        return {
            kind: 'trim',
            summary: `Trim clip ${end != null ? `to ${end}s` : 'from start'}${start ? ` starting at ${start}s` : ''}`,
            args: { start: start ?? 0, end },
            confidence: 0.9,
        };
    }

    // ── CROP ──
    if (/\b(crop)\b/.test(t)) {
        let preset: '9:16' | '16:9' | '1:1' | undefined;
        if (/(9:16|portrait|vertical|reels?|shorts?|tiktok)/.test(t)) preset = '9:16';
        else if (/(16:9|landscape|youtube|widescreen)/.test(t)) preset = '16:9';
        else if (/(1:1|square)/.test(t)) preset = '1:1';
        return { kind: 'crop', summary: `Crop to ${preset ?? 'specified box'}`, args: { preset }, confidence: preset ? 0.95 : 0.7 };
    }

    // ── RESIZE ──
    if (/\b(resize|scale|shrink|enlarge)\b/.test(t)) {
        const dims = t.match(/(\d{2,4})\s*[x×]\s*(\d{2,4})/);
        const w = dims ? parseInt(dims[1], 10) : 720;
        const h = dims ? parseInt(dims[2], 10) : -2;
        return { kind: 'resize', summary: `Resize to ${w}x${h === -2 ? 'auto' : h}`, args: { w, h }, confidence: 0.85 };
    }

    // ── ROTATE ──
    if (/\b(rotate|turn|flip)\b/.test(t)) {
        const deg = /270|minus|counter/.test(t) ? 270 : /180/.test(t) ? 180 : 90;
        return { kind: 'rotate', summary: `Rotate ${deg}°`, args: { deg }, confidence: 0.85 };
    }

    // ── EXTRACT AUDIO ──
    if (/\b(extract|rip|pull|get)\b.*\b(audio|sound|music|mp3)\b/.test(t) || /\b(audio|mp3)\s*(from|of)\b/.test(t)) {
        return { kind: 'extract_audio', summary: 'Extract audio track from video', args: {}, confidence: 0.9 };
    }

    // ── VOICEOVER ──
    if (/\b(voice ?over|narration|speak|read (this|aloud)|tts|say this)\b/.test(t)) {
        const text = extractPhrase(t) || t.replace(/.*?(voice ?over|narration|speak|read|say this|tts)\s*(this|aloud|me)?\s*/i, '').trim();
        return { kind: 'voiceover', summary: `Generate voiceover${text ? ` for "${text.slice(0, 40)}…"` : ''}`, args: { text }, confidence: 0.9 };
    }

    // ── FULL VIDEO (the existing agentic pipeline) ──
    if (/\b(make|create|generate|produce|build)\b.*\b(video|reel|short|film|clip)\b/.test(t) || /\b(video|reel|short)\b.*\b(about|on|of)\b/.test(t)) {
        const topic = extractPhrase(t) || t.replace(/.*?(about|on|of)\s*/i, '').replace(/\b(make|create|generate|produce|build|a|an|full|please|for me)\b/gi, '').trim();
        return { kind: 'full_video', summary: `Generate full video${topic ? ` about "${topic}"` : ''}`, args: { topic }, confidence: 0.85 };
    }

    return { kind: 'unknown', summary: 'Could not classify request', args: {}, confidence: 0 };
}
