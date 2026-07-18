/**
 * ffmpeg-text.ts — correct ffmpeg `drawtext=text='...'` escaping.
 *
 * The drawtext filter takes its text inside a single-quoted filtergraph
 * string. Per ffmpeg's quoting rules we must escape: `\` `:` `'` `"` `,`
 * (and a literal backslash becomes `/` to avoid escaping the following
 * char). The legacy call sites in orchestrate.ts only handled `'` and `:`,
 * which left injection vectors (a `"`, `,`, or a trailing `\` in user
 * title/subtitle/cta could break out of the quoted text or inject filter
 * args). Centralize the complete escape here and use it everywhere.
 *
 * Mirrors the proven logic in src/agentic/operations/overlay.ts.
 */
export function ffmpegDrawtextEscape(t: string): string {
    return String(t)
        .replace(/\\/g, '/') // backslash first, so later escapes aren't re-escaped
        .replace(/:/g, '\\:')
        .replace(/'/g, "'\\''")
        .replace(/"/g, '\\"')
        .replace(/,/g, '\\,');
}
