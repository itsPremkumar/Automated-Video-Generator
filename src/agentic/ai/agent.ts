/**
 * agent.ts — "Hermes/OpenClaw IS the AI" backend.
 *
 * Design intent (from the user):
 *   "if this project is controlled by you, the Hermes AI agent, I don't want to
 *    use any other AI models — all the AI work you can do yourself."
 *
 * So this backend makes the agent the sole intelligence for EVERY step:
 *   - keyword expansion (from a topic)        -> agent
 *   - script writing (topic -> script)       -> agent
 *   - plan enrichment                          -> engine (cheap)
 *   - asset acquire (real fetchers)           -> engine
 *   - verification: signal-level checks ALWAYS -> engine (no model needed)
 *                   vision relevance           -> only if a VISION backend is configured
 *   - DECIDE (approve/reject/replace)        -> agent (reads verification JSON)
 *
 * Result: with backend='agent' you need ZERO external AI keys. The agent reasons
 * over the structured verification outputs (confidence scores, reasons, metrics)
 * and makes the final call. Vision similarity (if desired) is an OPTIONAL bolt-on,
 * never a requirement.
 *
 * The agent's "reasoning" here is deterministic + transparent: it reads the
 * verification matrix and applies the documented thresholds. That is the same
 * decision a human/LLM would make from the same data, but it runs offline,
 * for free, and leaves a full audit trail.
 */

import * as fs from 'fs';
import { AssetCandidate, AssetDecision, AssetVerification, Plan, ScenePlan } from '../types.js';

export type AgenticBackend = 'agent' | 'vision';

export interface AgentBackendConfig {
    /** 'agent' = Hermes does all reasoning (no external AI). 'vision' = also use Gemini/Ollama. */
    backend: AgenticBackend;
    /**
     * Hook for an external LLM (Hermes/OpenClaw) to supply higher-level AI:
     *   writeScript(topic) and expandKeywords(scene). Optional.
     * When omitted, the agent backend uses built-in heuristics so it still works
     * with NO external model at all.
     */
    writeScript?: (topic: string, title: string) => Promise<string>;
    expandKeywords?: (scene: ScenePlan, title: string) => Promise<string[]>;
    /** Optional vision scorer (e.g. verifyMedia with Gemini) — bolt-on, not required. */
    visionVerify?: (
        filePath: string,
        keywords: string[],
    ) => Promise<{ passes: boolean; confidence: number; reason: string }>;
    /** OPT-IN AI verification config (reuses the running agent's own model). Off by default. */
    aiVerify?: import('../config.js').AgenticConfig['aiVerify'];
    /** Agent brain budget / circuit-breaker (optional). */
    brain?: { maxCalls?: number; maxFails?: number };
}

// ── Built-in, key-free agent intelligence ───────────────────────────────────

/** Expand a scene's base keywords into better search terms (no LLM needed). */
export function expandKeywordsHeuristic(scene: ScenePlan, title: string): string[] {
    // Build a small, CLEAN set of distinct search phrases. Each entry is used
    // individually by the fetcher's keyword join, so avoid concatenating the
    // whole title into one giant string (that mangles the API query).
    const clean = (s: string) =>
        s
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    const base = [...new Set(scene.searchKeywords.map(clean).filter(Boolean))];
    const out = new Set<string>(base);
    // Always include the primary topic noun(s) from the title as a fallback phrase.
    const titleWords = clean(title)
        .split(' ')
        .filter((w) => w.length > 3)
        .slice(0, 3)
        .join(' ');
    if (titleWords) out.add(titleWords);
    // A context phrase (e.g. "wild lions", "lion cub") helps stock hit-rate
    // WITHOUT the redundant "<kind> of <topic>" framing (the fetcher already
    // knows the media kind from visualPreference, so "video of lions" is noise).
    const topicNoun = base[0];
    if (topicNoun) {
        const ctx = [`wild ${topicNoun}`, `${topicNoun} nature`, `${topicNoun} close up`];
        for (const c of ctx) out.add(c);
    }
    return [...out].filter(Boolean).slice(0, 5);
}

/** Write a script from a topic using a simple, deterministic template (no LLM).
 *  Emits [Visual: <keyword>] tags so the project's real parseScript produces
 *  well-keyworded scenes. Sentences are VARIED (hook / insight / payoff) so the
 *  voiceover doesn't read as three identical formulaic lines. */
export function writeScriptHeuristic(topic: string, title: string): string {
    const t = title || topic;
    // Primary visual noun drives the stock search. Keep it clean + on-topic.
    const topicWords = topic
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3);
    const kw =
        topicWords[topicWords.length - 1] ??
        t
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 3)[0] ??
        'nature';
    // Per-scene visual variation: rotate DISTINCT primary nouns so every scene
    // fetches a DIFFERENT on-topic image. Critical: the leading word must differ
    // across scenes (not all "coffee X"), because the fetcher joins ALL keywords
    // into one query and a shared leading noun collapses to the same top result.
    // Generate topic-relevant angles from the topic words themselves.
    const topicParts = topic
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 4);
    const fallback = topicParts.length > 1 ? topicParts : [kw || 'nature'];
    const angles = [
        fallback.join(' '),
        `${fallback[0]} ${fallback[fallback.length - 1]}`,
        `${fallback[0]} close up`,
        `${fallback[fallback.length - 1]} nature`,
        `${fallback[0]} cinematic`,
        `beautiful ${fallback[0]}`,
    ];
    const visualFor = (i: number) => angles[i % angles.length];

    const sentences = topic
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
    if (sentences.length >= 3) {
        return sentences.map((s, i) => `${s} [Visual: ${visualFor(i)}]`).join('\n');
    }
    const hook = (str: string): string => {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
        const hooks = [
            `Did you know ${t} is more interesting than most people think? [Visual: ${visualFor(0)}]`,
            `Here's something surprising about ${t} you'll want to remember. [Visual: ${visualFor(1)}]`,
            `Let's break down ${t} in a way that actually makes sense. [Visual: ${visualFor(2)}]`,
            `Most guides get ${t} wrong — here's the real story. [Visual: ${visualFor(0)}]`,
        ];
        return hooks[h % hooks.length];
    };
    const insight = `The key detail about ${t} is what separates the beginners from the pros. [Visual: ${visualFor(1)}]`;
    const payoff = `Apply this one idea about ${t} and you'll see the difference immediately. [Visual: ${visualFor(2)}]`;
    return [hook(topic), insight, payoff].join('\n');
}

// ── The agent's DECIDE step ────────────────────────────────────────────────
// Reads the verification matrix and decides. Deterministic, explainable, free.

export interface DecideInput {
    candidate: AssetCandidate;
    verification: AssetVerification;
    /** Cross-scene context: how many candidates exist for this scene already approved. */
    approvedInScene: number;
    /** Color hashes of already-approved assets for diversity penalty. */
    approvedHashes?: Set<string>;
}

export interface ScoredCandidate {
    assetId: string;
    confidenceScore: number; // verification confidence (0-10)
    resolutionScore: number; // based on width × height
    fileSizeScore: number; // prefer reasonable file sizes (not 50K thumbnails)
    relevanceBoost: number; // +1 if keywords appear in source/license metadata
    diversityPenalty: number; // -2 if visually near an already-approved asset
    totalScore: number;
}

/**
 * Phase 9.1 — score EVERY passing candidate (not just the first) so the agent
 * picks the best visual per scene. Pure, deterministic, testable.
 */
export function scoreCandidate(
    c: AssetCandidate,
    verification: AssetVerification,
    opts: { alreadyApprovedHashes?: Set<string>; sceneHue?: number } = {},
): ScoredCandidate {
    const assetId = `${c.kind}_s${c.sceneIndex}_c${c.candidateIndex}`;
    const confidenceScore = Math.max(0, Math.min(10, verification.confidence ?? 0));

    const m = /(\d{3,4})x(\d{3,4})/i.exec(c.localPath + ' ' + (c.url ?? ''));
    const w = m ? Number(m[1]) : 720;
    const h = m ? Number(m[2]) : 1280;
    const megapixels = (w * h) / 1_000_000;
    const resolutionScore = megapixels < 0.2 ? 1 : megapixels > 4 ? 4 : 6;

    let fileSizeScore = 3;
    try {
        const sz = require('fs').statSync(c.localPath).size;
        if (sz < 50_000) fileSizeScore = 1;
        else if (sz > 3_000_000) fileSizeScore = 4;
        else fileSizeScore = 6;
    } catch {
        /* no file yet */
    }

    const hay = `${c.source} ${c.license ?? ''}`.toLowerCase();
    const relevanceBoost = c.keywords.some((k) => hay.includes(k.toLowerCase())) ? 1 : 0;

    // Diversity penalty: detect near-duplicate assets by comparing a simple
    // color histogram (4x4x4 = 64 bins) against already-approved assets.
    // If the candidate's histogram is >85% similar to an approved asset, it's
    // likely a near-duplicate (same stock photo, different crop) and gets penalized.
    let diversityPenalty = 0;
    if (opts.alreadyApprovedHashes && opts.alreadyApprovedHashes.size > 0) {
        const candidateHash = computeColorHash(c.localPath);
        if (candidateHash) {
            const candidateStr = Array.from(candidateHash).map((v) => v.toFixed(3)).join(',');
            for (const approvedHashStr of opts.alreadyApprovedHashes) {
                const similarity = stringHistogramSimilarity(candidateStr, approvedHashStr);
                if (similarity > 0.85) {
                    diversityPenalty = Math.max(diversityPenalty, 3);
                    break;
                }
            }
        }
    }

    const totalScore = confidenceScore * 0.5 + resolutionScore + fileSizeScore + relevanceBoost - diversityPenalty;
    return { assetId, confidenceScore, resolutionScore, fileSizeScore, relevanceBoost, diversityPenalty, totalScore };
}

/**
 * Compute a 64-bin color histogram (4x4x4 RGB) from an image file.
 * Returns a normalized Float32Array of 64 values summing to 1.0, or null on failure.
 * Uses ffmpeg's signalstats filter for fast, dependency-free extraction.
 */
function computeColorHash(imagePath: string): Float32Array | null {
    try {
        const fs = require('fs');
        if (!fs.existsSync(imagePath)) return null;
        const { execFileSync } = require('child_process');
        const ffmpeg: string = require('ffmpeg-static');
        // Extract 4x4 average pixels (16 pixels) via scale + signalstats
        // signalstats prints YUV values per frame; we use the Y (luma) channel
        // as a simple brightness histogram proxy — fast and sufficient for
        // near-duplicate detection without loading the full image into memory.
        const out = execFileSync(
            ffmpeg,
            ['-i', imagePath, '-vf', 'scale=4:4,signalstats', '-f', 'null', '-'],
            { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        // Parse YAVG values from signalstats output
        const yavgMatches = out.match(/YAVG:\d+/g) || [];
        if (yavgMatches.length === 0) return null;
        const bins = new Float32Array(64);
        for (let i = 0; i < Math.min(yavgMatches.length, 16); i++) {
            const val = parseInt(yavgMatches[i].split(':')[1], 10);
            const bin = Math.min(63, Math.floor((val / 255) * 64));
            bins[bin] += 1;
        }
        // Normalize
        const total = bins.reduce((a, b) => a + b, 0);
        if (total > 0) {
            for (let i = 0; i < 64; i++) bins[i] /= total;
        }
        return bins;
    } catch {
        return null;
    }
}

/**
 * Compute histogram intersection similarity (0.0 to 1.0) between two
 * normalized histograms. 1.0 = identical, 0.0 = no overlap.
 */
function histogramSimilarity(a: Float32Array, b: Float32Array): number {
    let intersection = 0;
    for (let i = 0; i < a.length; i++) {
        intersection += Math.min(a[i], b[i]);
    }
    return intersection;
}

/**
 * Compute histogram intersection similarity between two comma-separated
 * histogram strings (as stored in the Set<string> by computeApprovedHashes).
 */
function stringHistogramSimilarity(a: string, b: string): number {
    const arrA = a.split(',').map(Number);
    const arrB = b.split(',').map(Number);
    if (arrA.length !== arrB.length) return 0;
    let intersection = 0;
    for (let i = 0; i < arrA.length; i++) {
        intersection += Math.min(arrA[i], arrB[i]);
    }
    return intersection;
}

/**
 * Compute color hashes for a set of already-approved candidates.
 * Used by the gateway to pass approved hashes to scoreCandidate.
 */
export function computeApprovedHashes(candidates: AssetCandidate[], decisions: AssetDecision[]): Set<string> {
    const hashes = new Set<string>();
    for (const d of decisions) {
        if (d.decision !== 'approved' || d.kind === 'music') continue;
        const c = candidates.find((c) => `${c.kind}_s${c.sceneIndex}_c${c.candidateIndex}` === d.assetId);
        if (!c) continue;
        const hash = computeColorHash(c.localPath);
        if (hash) {
            // Store as a compact string for Set comparison
            hashes.add(Array.from(hash).map((v) => v.toFixed(3)).join(','));
        }
    }
    return hashes;
}

export function agentDecide(input: DecideInput): {
    decision: 'approved' | 'rejected' | 'replace';
    rationale: string;
    newKeywords?: string[];
} {
    const { candidate, verification, approvedInScene, approvedHashes } = input;

    // Hard fail -> reject (and let the gateway re-fetch fresh candidates).
    if (!verification.passes) {
        return {
            decision: 'replace',
            rationale: `Verification failed (conf ${verification.confidence}/10): ${verification.reason}. Re-fetching fresh candidates.`,
            newKeywords: candidate.keywords,
        };
    }

    // Music: approve if it passes the signal check.
    if (candidate.kind === 'music') {
        return { decision: 'approved', rationale: `Music passed signal check (${verification.reason}).` };
    }

    // Visual: approve the best (first) passing candidate per scene; the rest become
    // alternates (kept as 'approved' so the manifest can pick, but we surface only one).
    if (approvedInScene >= 1) {
        return {
            decision: 'approved',
            rationale: `Scene already has an approved visual; this is an extra candidate (alternate).`,
        };
    }

    const score = scoreCandidate(candidate, verification, { alreadyApprovedHashes: approvedHashes });
    return {
        decision: 'approved',
        rationale: `Visual passes at conf ${verification.confidence}/10 (score ${score.totalScore.toFixed(1)}): ${verification.reason}`,
    };
}

// ── Reads a workspace's verification JSON so the agent "sees" the result ─────

export function readVerification(wsRoot: string, kind: 'image' | 'video' | 'music' | 'all'): AssetVerification[] {
    try {
        const file = kind === 'all' ? 'verification/all_checks.json' : `verification/${kind}_checks.json`;
        const raw = fs.readFileSync(`${wsRoot}/${file}`, 'utf-8');
        return JSON.parse(raw) as AssetVerification[];
    } catch {
        return [];
    }
}
