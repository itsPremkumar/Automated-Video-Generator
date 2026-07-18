/**
 * route.ts — natural-language intent router.
 *
 * The user says ONE plain sentence ("merge these two videos", "give me a
 * voiceover of this text", "crop to 9:16", "make me a full video about cats").
 * The router classifies it into a SINGLE task (or a short CHAIN of tasks) and
 * returns a structured plan describing which operation(s) to run and with what
 * arguments. It does NOT execute anything.
 *
 * Design rule (project constraint): ZERO-COST, NO paid key. Classification is
 * KEYWORD-HEURISTIC FIRST. An optional free model (AgentBrain) may refine
 * extracted arguments, but the router MUST work fully offline with no model
 * configured (heuristic fallback always returns a valid task).
 */

import { AgentBrain } from '../brain.js';

export type TaskKind =
    | 'merge'
    | 'trim'
    | 'crop'
    | 'resize'
    | 'rotate'
    | 'extract_audio'
    | 'split'
    | 'add_captions'
    | 'add_music'
    | 'localize'
    | 'grade'
    | 'slow_motion'
    | 'speed_ramp'
    | 'watermark'
    | 'lower_third'
    | 'progress_bar'
    | 'derive'
    | 'voiceover'
    | 'download_image'
    | 'download_video'
    | 'full_video'
    | 'unknown';

export interface RoutedTask {
    kind: TaskKind;
    summary: string;
    args: Record<string, any>;
    confidence: number;
}

export interface RoutedChain {
    chain: RoutedTask[];
    summary: string;
}

const STOP = new Set([
    'a', 'an', 'the', 'of', 'for', 'to', 'and', 'or', 'in', 'on', 'with', 'about', 'from', 'into', 'my', 'me', 'please', 'can', 'you', 'could',
]);

/** Pull a quoted or trailing phrase that looks like the "text/keyword" payload. */
function extractPhrase(text: string): string {
    const quoted = text.match(/["'“]([^"'"”]+)["'”]/);
    if (quoted) return quoted[1].trim();
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
    return { start: start ? parseFloat(start[1]) : 0, end: end ? parseFloat(end[1]) : undefined };
}

/** Find file paths / bare names with media extensions mentioned in the text. */
function extractPaths(text: string): string[] {
    const paths = text.match(/(\.?\/)?(?:[\w .-]+\/)*[\w.-]+\.(mp4|mov|webm|m4v|mp3|wav|jpg|jpeg|png|webp)/gi);
    if (paths) return paths.map((p) => p.trim());
    return [];
}

/** Detect an explicit 2-step chain connector ("then", "and then", ", then"). */
function splitChain(prompt: string): string[] {
    return prompt
        .split(/\s*(?:,\s*)?(?:then|and then|after that|,)\s*/i)
        .map((s) => s.trim())
        .filter(Boolean);
}

function classifyOne(t: string): RoutedTask {
    const low = t.toLowerCase();

    // ── DOWNLOAD (image/video by keyword) ──
    if (/\b(download|get|fetch|give me|find|search)\b/.test(low) && /\b(image|photo|picture|pic)\b/.test(low)) {
        const kw = extractPhrase(t) || t.replace(/.*?(image|photo|picture|pic|of)\s*/i, '').replace(/\b(download|get|fetch|give me|find|search|please|for me)\b/gi, '').trim();
        return { kind: 'download_image', summary: `Download a free image for "${kw}"`, args: { keyword: kw }, confidence: 0.9 };
    }
    if (/\b(download|get|fetch|give me|find|search)\b/.test(low) && /\b(video|footage|clip)\b/.test(low) && !/\bmerge|combine|join\b/.test(low)) {
        const kw = extractPhrase(t) || t.replace(/.*?(video|footage|clip|of)\s*/i, '').replace(/\b(download|get|fetch|give me|find|search|please|for me)\b/gi, '').trim();
        return { kind: 'download_video', summary: `Download a free video for "${kw}"`, args: { keyword: kw }, confidence: 0.9 };
    }

    // ── MERGE ──
    if (/\b(merge|combine|join|concat|put together|stitch)\b/.test(low) && /\b(video|clip|footage|together)\b/.test(low)) {
        const paths = extractPaths(t);
        return { kind: 'merge', summary: paths.length >= 2 ? `Merge ${paths.length} videos` : 'Merge provided videos', args: { files: paths.length ? paths : undefined }, confidence: 0.95 };
    }

    // ── TRIM ──
    if (/\b(trim|cut|shorten|slice)\b/.test(low)) {
        const { start, end } = extractTimes(t);
        return { kind: 'trim', summary: `Trim clip ${end != null ? `to ${end}s` : 'from start'}${start ? ` starting at ${start}s` : ''}`, args: { start: start ?? 0, end }, confidence: 0.9 };
    }

    // ── SPLIT ──
    if (/\b(split|divide|segment|cut into|break into)\b/.test(low)) {
        const n = (t.match(/(\d+)\s*(?:parts|segments|pieces|clips)/i) || [])[1];
        const marks = (t.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?/g) || []).map((x) => parseFloat(x)).filter((x) => x > 0);
        return { kind: 'split', summary: n ? `Split into ${n} parts` : `Split at ${marks.join(', ')}`, args: { parts: n ? parseInt(n, 10) : undefined, marks }, confidence: 0.9 };
    }

    // ── CROP ──
    if (/\b(crop)\b/.test(low)) {
        let preset: '9:16' | '16:9' | '1:1' | undefined;
        if (/(9:16|portrait|vertical|reels?|shorts?|tiktok)/.test(low)) preset = '9:16';
        else if (/(16:9|landscape|youtube|widescreen)/.test(low)) preset = '16:9';
        else if (/(1:1|square)/.test(low)) preset = '1:1';
        return { kind: 'crop', summary: `Crop to ${preset ?? 'specified box'}`, args: { preset }, confidence: preset ? 0.95 : 0.7 };
    }

    // ── RESIZE ──
    if (/\b(resize|scale|shrink|enlarge)\b/.test(low)) {
        const dims = t.match(/(\d{2,4})\s*[x×]\s*(\d{2,4})/);
        return { kind: 'resize', summary: `Resize to ${dims ? dims[1] + 'x' + dims[2] : '720 auto'}`, args: { w: dims ? parseInt(dims[1], 10) : 720, h: dims ? parseInt(dims[2], 10) : -2 }, confidence: 0.85 };
    }

    // ── ROTATE ──
    if (/\b(rotate|turn|flip)\b/.test(low)) {
        const deg = /270|minus|counter/.test(low) ? 270 : /180/.test(low) ? 180 : 90;
        return { kind: 'rotate', summary: `Rotate ${deg}°`, args: { deg }, confidence: 0.85 };
    }

    // ── EXTRACT AUDIO ──
    if (/\b(extract|rip|pull|get)\b.*\b(audio|sound|music|mp3)\b/.test(low) || /\b(audio|mp3)\s*(from|of)\b/.test(low)) {
        return { kind: 'extract_audio', summary: 'Extract audio track from video', args: {}, confidence: 0.9 };
    }

    // ── ADD CAPTIONS ──
    if (/\b(captions?|subtitle|subtitles?|burn.*text|add.*(captions?|subtitle|text))\b/.test(low)) {
        const srt = extractPaths(t).find((p) => /\.srt$/i.test(p));
        const text = extractPhrase(t) || (srt ? '' : t.replace(/.*?(caption|subtitle|text|of)\s*/i, '').replace(/\b(add|burn|with|please)\b/gi, '').trim());
        return { kind: 'add_captions', summary: `Add captions to video`, args: { text, srt }, confidence: 0.9 };
    }

    // ── ADD MUSIC ──
    if (/\b(music|soundtrack|background music|add.*audio|bgm)\b/.test(low) && !/\b(extract|rip)\b/.test(low)) {
        const kw = extractPhrase(t) || 'ambient lofi';
        return { kind: 'add_music', summary: `Add music (${kw})`, args: { query: kw }, confidence: 0.9 };
    }

    // ── LOCALIZE ──
    if (/\b(translat|localiz|subtitle.*(spanish|french|hindi|tamil|language)|(spanish|french|hindi|tamil).*version)/.test(low)) {
        const langs = (t.match(/\b(es|fr|hi|ta|de|ja|zh|espanol|french|hindi|tamil|german|japanese|chinese)\b/gi) || []).map((l) => l.toLowerCase());
        const text = extractPhrase(t);
        return { kind: 'localize', summary: `Localize to ${langs.join(', ')}`, args: { languages: langs.length ? langs : ['es'], text }, confidence: 0.85 };
    }

    // ── GRADE ──
    if (/\b(grade|color (grade|correct|look)|cinematic look|filter|vintage|film look)\b/.test(low)) {
        let preset: string = 'cinematic';
        if (/(neon|vibrant)/.test(low)) preset = 'neon';
        else if (/(teal|orange)/.test(low)) preset = 'teal-orange';
        else if (/(warm)/.test(low)) preset = 'warm';
        else if (/(cool)/.test(low)) preset = 'cool';
        else if (/(vivid|pop)/.test(low)) preset = 'vivid';
        else if (/(bleach|desaturat|grey|gray)/.test(low)) preset = 'bleach-bypass';
        else if (/(neutral|natural)/.test(low)) preset = 'neutral';
        return { kind: 'grade', summary: `Apply '${preset}' grade`, args: { preset }, confidence: 0.85 };
    }

    // ── SLOW MOTION / SPEED RAMP ──
    if (/\b(slow|slowmo|slow-mo|slow motion)\b/.test(low)) {
        const f = (t.match(/(\d+)\s*[x×]/) || [])[1];
        return { kind: 'slow_motion', summary: `Slow motion ${f ? f + 'x' : '2x'}`, args: { factor: f ? parseInt(f, 10) : 2 }, confidence: 0.85 };
    }
    if (/\b(speed.?ramp|ramp|speed up|fast forward)\b/.test(low)) {
        const marks = (t.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)?/g) || []).map((x) => parseFloat(x)).filter((x) => x > 0);
        return { kind: 'speed_ramp', summary: `Speed-ramp at ${marks.join('-')}`, args: { rampStart: marks[0] ?? 1, rampEnd: marks[1] ?? 3, slowFactor: 3 }, confidence: 0.8 };
    }

    // ── WATERMARK / LOWER-THIRD / PROGRESS BAR ──
    if (/\b(watermark|logo)\b/.test(low)) {
        const label = extractPhrase(t) || 'MyBrand';
        return { kind: 'watermark', summary: `Watermark "${label}"`, args: { label }, confidence: 0.9 };
    }
    if (/\b(lower.?third|name bar|title bar)\b/.test(low)) {
        const text = extractPhrase(t) || 'Title';
        return { kind: 'lower_third', summary: `Lower-third "${text}"`, args: { text }, confidence: 0.85 };
    }
    if (/\b(progress bar)\b/.test(low)) {
        return { kind: 'progress_bar', summary: 'Add progress bar', args: {}, confidence: 0.85 };
    }

    // ── DERIVE (multi-aspect + thumbnail) ──
    if (/\b(multi.?aspect|square version|landscape version|portrait version|thumbnail|different (sizes|aspects)|repurpose)\b/.test(low)) {
        return { kind: 'derive', summary: 'Produce multi-aspect + thumbnail', args: { aspects: ['9:16', '16:9', '1:1'], thumbnail: true }, confidence: 0.85 };
    }

    // ── VOICEOVER ──
    if (/\b(voice ?over|narration|speak|read (this|aloud)|tts|say this)\b/.test(low)) {
        const text = extractPhrase(t) || t.replace(/.*?(voice ?over|narration|speak|read|say this|tts)\s*(this|aloud|me)?\s*/i, '').trim();
        return { kind: 'voiceover', summary: `Generate voiceover${text ? ` for "${text.slice(0, 40)}…"` : ''}`, args: { text }, confidence: 0.9 };
    }

    // ── FULL VIDEO ──
    if (/\b(make|create|generate|produce|build)\b.*\b(video|reel|short|film|clip)\b/.test(low) || /\b(video|reel|short)\b.*\b(about|on|of)\b/.test(low)) {
        const topic = extractPhrase(t) || t.replace(/.*?(about|on|of)\s*/i, '').replace(/\b(make|create|generate|produce|build|a|an|full|please|for me)\b/gi, '').trim();
        return { kind: 'full_video', summary: `Generate full video${topic ? ` about "${topic}"` : ''}`, args: { topic }, confidence: 0.85 };
    }

    return { kind: 'unknown', summary: 'Could not classify request', args: {}, confidence: 0 };
}

/**
 * Route a prompt into one task or a short chain (max 3 steps).
 * Chain detection: a connector word ("then", "and then", ",") splits the
 * request into sub-requests, each classified independently. The FIRST task's
 * file args seed the chain; later steps receive the previous step's output as
 * their input file automatically by the dispatcher.
 */
export function routeTask(prompt: string, _brain?: AgentBrain): RoutedTask | RoutedChain {
    const parts = splitChain(prompt);
    if (parts.length >= 2) {
        const chain = parts.slice(0, 3).map((p) => classifyOne(p));
        if (chain.length >= 2 && chain.every((c) => c.kind !== 'unknown')) {
            return { chain, summary: chain.map((c) => c.summary).join(' → ') };
        }
    }
    return classifyOne(prompt);
}

export type RouteResult = RoutedTask | RoutedChain;
export function isChain(r: RouteResult): r is RoutedChain {
    return (r as RoutedChain).chain !== undefined;
}
