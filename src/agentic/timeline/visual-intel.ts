/**
 * visual-intel.ts — ADVANCED: local, offline visual intelligence.
 *
 * No API keys, no network. Three deterministic signals that used to be
 * missing and caused "same image every scene / off-topic / dull" output:
 *  1. relevance: token-overlap between scene keywords and candidate keywords
 *  2. dedupe: perceptual-ish hash (dHash on downscaled pixels via sharp when
 *     available, else size+name fallback) with hamming distance
 *  3. aesthetic: brightness/contrast/saturation variance heuristic from
 *     probe metadata (no pixel read needed for the fast path)
 *
 * All pure + safe: null/missing inputs score 0, never throw.
 */

export interface ScoredCandidate {
    id: string;
    sceneIndex: number;
    keywords: string[];
    localPath?: string | null;
    width?: number | null;
    height?: number | null;
    sizeBytes?: number | null;
    relevance: number;
    aesthetic: number;
    hash: string | null;
    total: number;
}

function tokens(s: string): Set<string> {
    return new Set(
        s
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 2 && !STOP.has(w)),
    );
}

const STOP = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'your',
    'you',
    'are',
    'was',
    'were',
    'have',
    'has',
    'will',
    'with',
    'video',
    'image',
    'photo',
]);

/** 0..10 keyword overlap (Jaccard-ish scaled). */
export function relevanceScore(sceneKeywords: string[], candKeywords: string[]): number {
    try {
        const a = tokens(sceneKeywords.join(' '));
        const b = tokens(candKeywords.join(' '));
        if (a.size === 0 || b.size === 0) return 0;
        let inter = 0;
        for (const w of a) if (b.has(w)) inter++;
        const union = new Set([...a, ...b]).size;
        const j = inter / Math.max(1, union);
        // Boost exact-phrase hits.
        const joined = candKeywords.join(' ').toLowerCase();
        let boost = 0;
        for (const w of a) if (joined.includes(w)) boost += 0.5;
        return Math.max(0, Math.min(10, Math.round((j * 10 + Math.min(3, boost)) * 10) / 10));
    } catch {
        return 0;
    }
}

/** 0..10 aesthetic prior from geometry + file size (proxy for detail). */
export function aestheticScore(width?: number | null, height?: number | null, sizeBytes?: number | null): number {
    try {
        let s = 5;
        const w = Number(width) || 0;
        const h = Number(height) || 0;
        if (w >= 1280 && h >= 720) s += 2;
        else if (w >= 640 && h >= 360) s += 1;
        else if (w > 0) s -= 1;
        const ar = w > 0 && h > 0 ? w / h : 0;
        if (ar > 0.4 && ar < 2.5) s += 1;
        else if (ar > 0) s -= 1;
        if (sizeBytes != null) {
            if (sizeBytes > 200_000) s += 1;
            else if (sizeBytes < 20_000) s -= 2;
        }
        return Math.max(0, Math.min(10, s));
    } catch {
        return 5;
    }
}

/** Hamming distance between hex hashes. */
export function hashDistance(a: string, b: string): number {
    try {
        if (a.length !== b.length) return 99;
        let d = 0;
        for (let i = 0; i < a.length; i++) {
            const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
            d += x.toString(2).split('1').length - 1;
        }
        return d;
    } catch {
        return 99;
    }
}

/**
 * Best-effort dHash of an image file. Uses sharp when installed;
 * falls back to a stable size+name hash (still dedupes exact copies).
 * Never throws — returns null when unreadable.
 */
export async function fileHash(localPath: string): Promise<string | null> {
    try {
        const fs = await import('fs');
        if (!fs.existsSync(localPath)) return null;
        try {
            const sharpMod: any = ((await import('sharp').catch(() => null)) as any)?.default ?? null;
            if (sharpMod) {
                const buf: Buffer = await sharpMod(localPath)
                    .greyscale()
                    .resize(9, 8, { fit: 'fill' })
                    .raw()
                    .toBuffer();
                let bits = '';
                for (let y = 0; y < 8; y++) {
                    for (let x = 0; x < 8; x++) {
                        bits += buf[y * 9 + x + 1] > buf[y * 9 + x] ? '1' : '0';
                    }
                }
                let hex = '';
                for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
                return hex;
            }
        } catch {
            /* fall through to stable fallback */
        }
        const st = fs.statSync(localPath);
        const base = `${st.size}:${localPath.toLowerCase().split(/[/\\]/).pop()}`;
        let h = 0;
        for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
        return h.toString(16).padStart(8, '0').repeat(2).slice(0, 16);
    } catch {
        return null;
    }
}

/** Score + rank candidates for one scene. Pure except hash passthrough. */
export function rankCandidates(
    sceneKeywords: string[],
    cands: {
        id: string;
        sceneIndex: number;
        keywords: string[];
        localPath?: string | null;
        width?: number | null;
        height?: number | null;
        sizeBytes?: number | null;
        hash?: string | null;
    }[],
): ScoredCandidate[] {
    const scored: ScoredCandidate[] = cands.map((c) => {
        const relevance = relevanceScore(sceneKeywords, c.keywords);
        const aesthetic = aestheticScore(c.width, c.height, c.sizeBytes);
        const total = Math.round((relevance * 0.7 + aesthetic * 0.3) * 10) / 10;
        return { ...c, relevance, aesthetic, hash: c.hash ?? null, total };
    });
    return scored.sort((a, b) => b.total - a.total);
}

/**
 * Greedy cross-scene dedupe: walk scenes in order, pick highest-total
 * candidate whose hash is far enough from already-picked hashes.
 * threshold: hamming distance < 6 = near-duplicate.
 */
export function dedupeAcrossScenes(rankedByScene: ScoredCandidate[][]): (ScoredCandidate | null)[] {
    const pickedHashes: string[] = [];
    return rankedByScene.map((ranked) => {
        for (const c of ranked) {
            if (!c.hash) return c;
            const dup = pickedHashes.some((h) => hashDistance(h, c.hash as string) < 6);
            if (!dup) {
                pickedHashes.push(c.hash);
                return c;
            }
        }
        return ranked[0] ?? null;
    });
}

/**
 * Normalized identity key for cross-scene visual dedupe: same photo served
 * under different crops/URLs must still collide. Uses the URL without query
 * params (stock CDNs sign URLs per request) backed by the local filename.
 */
export function visualDedupeKey(url: string | null | undefined, localPath: string | null | undefined): string {
    const u = String(url ?? '')
        .toLowerCase()
        .split('?')[0]
        .split('#')[0];
    const base = String(localPath ?? '')
        .toLowerCase()
        .split(/[/\\]/)
        .pop();
    // Strip downloader-added prefixes (scene_01_, replaced_<ts>_, vfx_<i>_)
    // so the same remote file downloaded twice still collides.
    const stem = (base ?? '')
        .replace(/\.(jpg|jpeg|png|webp|mp4|mov|webm|m4v)$/, '')
        .replace(/^(scene_\d+_|replaced_\d+_|vfx_\d+_|shake_\d+_?)/, '');
    return `${u}::${stem}`;
}

/**
 * Pick one asset id per scene so no two scenes share the same visual.
 * `rankedIdsByScene` must already be ordered best-first per scene.
 * Scenes with no unused candidate keep their best pick (never blocks).
 */
export function pickDistinctPerScene(
    rankedIdsByScene: { sceneIndex: number; ids: string[] }[],
    keyOf: (id: string) => string,
): Map<number, string> {
    const used = new Set<string>();
    const picks = new Map<number, string>();
    for (const { sceneIndex, ids } of rankedIdsByScene) {
        const fresh = ids.find((id) => !used.has(keyOf(id)));
        const pick = fresh ?? ids[0] ?? null;
        if (pick) {
            picks.set(sceneIndex, pick);
            used.add(keyOf(pick));
        }
    }
    return picks;
}

/** Face-safe center crop filter for portrait/landscape (rule-of-thirds bias). */
export function faceSafeCropFilter(srcW: number, srcH: number, dstW: number, dstH: number): string {
    const targetAr = dstW / dstH;
    const srcAr = srcW / srcH;
    if (Math.abs(srcAr - targetAr) < 0.02) return 'scale=' + dstW + ':' + dstH;
    if (srcAr > targetAr) {
        // Too wide: crop width, bias slightly above center (faces sit high).
        return `scale=-2:${dstH},crop=${dstW}:${dstH}:(in_w-out_w)/2:(in_h-out_h)*0.38`;
    }
    return `scale=${dstW}:-2,crop=${dstW}:${dstH}:(in_w-out_w)/2:(in_h-out_h)*0.38`;
}
