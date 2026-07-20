/** Caption processing utilities — SRT formatting, chunking, word-merging */

export function fmtSrt(sec: number): string {
    const ms = Math.round((sec % 1) * 1000);
    const total = Math.floor(sec);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function escapeFilterPath(p: string): string {
    return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/**
 * chunkCues — smart caption chunking: merge sub-100ms / <3-char micro-segments
 * into the previous, enforce minimum 500ms display, and split >8-word segments.
 */
export function chunkCues(
    segs: { text: string; startMs: number; endMs: number }[],
): { text: string; startMs: number; endMs: number }[] {
    if (!segs.length) return segs;
    const merged: { text: string; startMs: number; endMs: number }[] = [];
    for (const s of segs) {
        const prev = merged[merged.length - 1];
        if (prev && (s.endMs - s.startMs < 100 || s.text.trim().length < 3)) {
            prev.text = (prev.text + ' ' + s.text).trim();
            prev.endMs = s.endMs;
        } else {
            merged.push({ ...s, text: s.text.trim() });
        }
    }
    const out: { text: string; startMs: number; endMs: number }[] = [];
    for (const m of merged) {
        const { startMs, text } = m;
        let { endMs } = m;
        if (endMs - startMs < 500) endMs = startMs + 500;
        const words = text.split(/\s+/);
        if (words.length > 8) {
            const mid = Math.ceil(words.length / 2);
            const tSplit = startMs + Math.round((endMs - startMs) / 2);
            out.push({ text: words.slice(0, mid).join(' '), startMs, endMs: tSplit });
            out.push({ text: words.slice(mid).join(' '), startMs: tSplit, endMs });
        } else {
            out.push({ text, startMs, endMs });
        }
    }
    return out;
}

/**
 * mergeWordsToLines — collapse word-level caption segments into LINE-level
 * for drawtext burn-in (avoids ENAMETOOLONG on Windows).
 */
export function mergeWordsToLines(
    segs: { text: string; startMs: number; endMs: number }[],
    maxWords = 7,
): { text: string; startMs: number; endMs: number }[] {
    const base = chunkCues(segs);
    if (base.length <= 1) return base;
    const lines: { text: string; startMs: number; endMs: number }[] = [];
    let cur: { text: string; startMs: number; endMs: number } | null = null;
    for (const s of base) {
        const w = s.text.trim();
        if (!w) continue;
        if (
            !cur ||
            cur.text.split(/\s+/).length >= maxWords ||
            /[.!?]$/.test(cur.text)
        ) {
            cur = { text: w, startMs: s.startMs, endMs: s.endMs };
            lines.push(cur);
        } else {
            cur.text = (cur.text + ' ' + w).trim();
            cur.endMs = s.endMs;
        }
    }
    return lines;
}
