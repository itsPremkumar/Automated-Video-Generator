/**
 * render-ledger.ts — persistent cross-render learning store (Autonomy L3).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * The pipeline advertises an `AutonomyLevel` of `'L3-self-improving'`, but until
 * now every render started cold: nothing was remembered across runs. The AI
 * brain re-derived script/keywords/pacing/hook from scratch each time and the
 * gate's verdict was discarded the moment the process exited.
 *
 * This module is the missing memory. After a render completes, callers record a
 * compact `RenderRecord` — the topic, the creative choices that were made, and
 * the empirical outcome (gate pass + score + vision verdict). Before the next
 * render, the brain (or any planner) can query `bestFor(topic)` to prime its
 * heuristics from the highest-scoring past render for a *similar* topic.
 *
 * DESIGN RULES (locked by project constraints)
 * --------------------------------------------
 *  - STANDALONE / BACKWARD-COMPATIBLE: nothing existing imports this. It is an
 *    opt-in additive layer; the pipeline behaves exactly as before if it is
 *    never called. No old code is modified or deleted.
 *  - CONTAINED: the ledger file lives under the project workspace
 *    (`workspace/.avs/render-ledger.json`), never in system TEMP.
 *  - SAFE: every read/write is defensive. A corrupt or missing ledger degrades
 *    to "no history" — it never throws into the render path.
 *  - FREE / OFFLINE: pure local JSON. No network, no paid API.
 *  - BOUNDED: the ledger self-caps at MAX_RECORDS (ring buffer) so it can't grow
 *    without limit on a RAM/disk-constrained box.
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveWorkspacePath } from '../../shared/runtime/paths.js';

/** One recorded render outcome. All fields JSON-serialisable and inspectable. */
export interface RenderRecord {
    /** Unix ms when the record was written. */
    ts: number;
    /** The video topic (used for similarity matching). */
    topic: string;
    /** Optional job id / title for human traceability. */
    jobId?: string;
    title?: string;
    /** The creative choices that produced this render (the "genome"). Only the
     *  fields a planner would want to reuse — kept small on purpose. */
    choices: {
        orientation?: string;
        aspect?: string;
        paletteFilter?: string;
        captionTheme?: string;
        transition?: string;
        hookScene?: number;
        musicIntensity?: string;
        voice?: string;
        preset?: string;
        videoType?: string;
        [k: string]: unknown;
    };
    /** Empirical outcome. */
    outcome: {
        /** Did the final gate pass? */
        gatePass: boolean;
        /** Normalised 0..1 quality score (gate checks passed / total, blended
         *  with the vision verdict when present). */
        score: number;
        /** Vision model verdict, when a vision gate ran. */
        visionPass?: boolean;
        /** Runtime in seconds of the produced video, when known. */
        durationSec?: number;
        /** Absolute/relative path to the produced MP4, when known. */
        outputPath?: string;
    };
}

const MAX_RECORDS = 500;

/** Absolute path to the ledger file (under workspace, never system TEMP). */
export function ledgerPath(): string {
    return resolveWorkspacePath('.avs', 'render-ledger.json');
}

/** Read all records. Returns [] on any error (missing/corrupt/unreadable). */
export function readLedger(file = ledgerPath()): RenderRecord[] {
    try {
        const raw = fs.readFileSync(file, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Keep only structurally valid records.
        return parsed.filter(
            (r): r is RenderRecord =>
                r && typeof r === 'object' && typeof r.topic === 'string' && r.outcome && typeof r.outcome === 'object',
        );
    } catch {
        return [];
    }
}

/**
 * Append a record to the ledger (ring-buffered to MAX_RECORDS). Returns true on
 * success, false on any failure — NEVER throws into the render path.
 */
export function recordRender(rec: Omit<RenderRecord, 'ts'> & { ts?: number }, file = ledgerPath()): boolean {
    try {
        const full: RenderRecord = { ...rec, ts: rec.ts ?? Date.now() };
        const all = readLedger(file);
        all.push(full);
        // Ring buffer: drop the oldest when over the cap.
        const trimmed = all.length > MAX_RECORDS ? all.slice(all.length - MAX_RECORDS) : all;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        // Atomic-ish write: temp file + rename, so a crash mid-write can't
        // corrupt the ledger.
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2), 'utf-8');
        fs.renameSync(tmp, file);
        return true;
    } catch {
        return false;
    }
}

/** Lowercased word set for cheap Jaccard topic similarity. */
function tokenize(s: string): Set<string> {
    return new Set(
        s
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 2),
    );
}

/** Jaccard similarity between two topic strings (0..1). */
export function topicSimilarity(a: string, b: string): number {
    const A = tokenize(a);
    const B = tokenize(b);
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    for (const w of A) if (B.has(w)) inter++;
    const union = A.size + B.size - inter;
    return union === 0 ? 0 : inter / union;
}

export interface BestForOptions {
    /** Minimum topic similarity to consider a record relevant. Default 0.34. */
    minSimilarity?: number;
    /** Only consider records whose gate passed. Default true. */
    requireGatePass?: boolean;
    /** Ledger file override (tests). */
    file?: string;
}

/**
 * Return the best past render for a topic — the highest (score × recency-weighted
 * similarity) record above the similarity threshold — or null when there is no
 * useful history. A planner uses `.choices` to prime its next render.
 */
export function bestFor(topic: string, opts: BestForOptions = {}): RenderRecord | null {
    const minSim = opts.minSimilarity ?? 0.34;
    const requirePass = opts.requireGatePass ?? true;
    const all = readLedger(opts.file);
    let best: { rec: RenderRecord; rank: number } | null = null;
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    for (const rec of all) {
        if (requirePass && !rec.outcome.gatePass) continue;
        const sim = topicSimilarity(topic, rec.topic);
        if (sim < minSim) continue;
        // Recency weight: linearly decays to 0.5 over 30 days, floored at 0.5.
        const ageMs = Math.max(0, now - rec.ts);
        const recency = 1 - 0.5 * Math.min(1, ageMs / THIRTY_DAYS);
        const score = Math.max(0, Math.min(1, rec.outcome.score));
        const rank = sim * score * recency;
        if (!best || rank > best.rank) best = { rec, rank };
    }
    return best?.rec ?? null;
}

/**
 * Aggregate the winning choices across all high-scoring records for a topic —
 * "what usually works." Returns the most common value per choice field among
 * records scoring above `minScore`. Useful for priming a fresh job when no
 * single near-duplicate exists.
 */
export function winningChoices(topic: string, opts: BestForOptions & { minScore?: number } = {}): RenderRecord['choices'] {
    const minSim = opts.minSimilarity ?? 0.2;
    const minScore = opts.minScore ?? 0.75;
    const all = readLedger(opts.file).filter(
        (r) => r.outcome.gatePass && r.outcome.score >= minScore && topicSimilarity(topic, r.topic) >= minSim,
    );
    const tally: Record<string, Map<string, number>> = {};
    for (const r of all) {
        for (const [k, v] of Object.entries(r.choices)) {
            if (v == null) continue;
            const key = String(v);
            (tally[k] ??= new Map()).set(key, (tally[k].get(key) ?? 0) + 1);
        }
    }
    const out: RenderRecord['choices'] = {};
    for (const [field, counts] of Object.entries(tally)) {
        let bestVal: string | undefined;
        let bestN = 0;
        for (const [val, n] of counts) {
            if (n > bestN) {
                bestN = n;
                bestVal = val;
            }
        }
        if (bestVal !== undefined) out[field] = bestVal;
    }
    return out;
}

/** Compact stats for an operator dashboard / CLI. */
export function ledgerStats(file = ledgerPath()): {
    total: number;
    passed: number;
    avgScore: number;
    topics: number;
} {
    const all = readLedger(file);
    const passed = all.filter((r) => r.outcome.gatePass).length;
    const avg = all.length ? all.reduce((s, r) => s + (r.outcome.score || 0), 0) / all.length : 0;
    const topics = new Set(all.map((r) => r.topic.toLowerCase().trim())).size;
    return { total: all.length, passed, avgScore: Number(avg.toFixed(3)), topics };
}
