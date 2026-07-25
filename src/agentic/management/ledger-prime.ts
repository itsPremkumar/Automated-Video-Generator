/**
 * ledger-prime.ts — the MISSING L3 link: closes the read side of the
 * render-ledger learning loop.
 *
 * WHY THIS FILE EXISTS
 * -------------------
 * `render-ledger.ts` declares an `AutonomyLevel` of `'L3-self-improving'` and
 * already *writes* outcomes (via autopilot.learnFromRender → recordRender). It
 * also exposes two read APIs — `bestFor(topic)` (the single best past render for
 * a similar topic) and `winningChoices(topic)` (the most common winning choices
 * across all high-scoring renders). But as of the audit, NEITHER was ever
 * imported outside its own test file — `brain.ts` / the planner never read the
 * ledger, so every render re-derived its creative choices cold. The L3
 * "self-improving" claim was half-wired: memory was stored but never consumed.
 *
 * This module is the consumption side. Given the topic + the user's raw config
 * INPUT (before preset/default resolution), it returns a primed input that
 * reuses proven choices from the ledger wherever the user left a field open.
 *
 * DESIGN RULES (locked by project constraints)
 * --------------------------------------------
 *  - STANDALONE / ADDITIVE: a brand-new file. The only edit to old code is a
 *    single guarded call site in autopilot.ts that primes the INPUT before
 *    resolveConfig. Behavior is identical to before when the ledger is empty or
 *    the topic is unfamiliar — EXPLICIT user-specified inputs always win; ledger
 *    priming only fills fields the user did not set.
 *  - SAFE: every failure path degrades to "return the input unchanged". Priming
 *    can never break a render.
 *  - FREE / OFFLINE: pure local JSON, same ledger file as recordRender.
 *  - CONTAINED: reads the ledger under workspace/.avs (never system TEMP).
 *
 * PRIMING STRATEGY (layered, most-to-least specific)
 * --------------------------------------------------
 *  1. If `bestFor(topic)` returns a near-duplicate (similarity ≥ 0.5), reuse its
 *     ENTIRE choices genome — "do exactly what worked last time".
 *  2. Otherwise, if `winningChoices(topic)` returns aggregate winners from
 *     several similar high-scoring renders, fill only the user-left-open fields
 *     with those consensus values.
 *  3. Always respect explicit user input: a field the user set is never
 *     overwritten by the ledger. resolveConfig() later layers presets/defaults
 *     UNDER the primed input, so priming correctly wins over the preset.
 */

import {
    bestFor,
    winningChoices,
    readLedger,
    topicSimilarity,
    type RenderRecord,
} from './render-ledger.js';
import type { AgenticConfig } from '../config.js';

/**
 * The choice fields the ledger tracks and that the planner can safely reuse.
 * Kept as a single source of truth so priming stays in sync with
 * render-ledger.learnFromRender().
 */
const PRIMABLE_FIELDS = [
    'orientation',
    'aspect',
    'paletteFilter',
    'captionTheme',
    'transition',
    'hookScene',
    'musicIntensity',
    'voice',
    'preset',
    'videoType',
] as const;

export type PrimableField = (typeof PRIMABLE_FIELDS)[number];

/** Similarity at/above this => treat the best record as a near-duplicate. */
export const NEAR_DUP_SIMILARITY = 0.5;

/** Opt-out env flag (default ON). Set AGENTIC_PRIME_LEDGER=0 to disable. */
export function ledgerPrimingEnabled(): boolean {
    return process.env.AGENTIC_PRIME_LEDGER !== '0';
}

function toChoicesMap(rec: RenderRecord): Partial<Record<PrimableField, unknown>> {
    const out: Partial<Record<PrimableField, unknown>> = {};
    for (const f of PRIMABLE_FIELDS) {
        const v = rec.choices?.[f];
        if (v != null) out[f] = v;
    }
    return out;
}

/**
 * Prime a user config INPUT from ledger history.
 *
 * @param input  raw user config input (may be partial — fields the user did NOT
 *               set are `undefined`/absent and become priming candidates)
 * @param topic  the render topic (used for similarity matching)
 * @param file   optional ledger file override (tests)
 * @returns      a NEW input object; identical to `input` when nothing applies
 *
 * Contract: user-specified fields (present in `input`) are preserved; only
 * gaps are filled. Never throws — on any error returns `input` unchanged.
 */
export function primeInputFromLedger(
    input: Partial<AgenticConfig>,
    topic: string,
    file?: string,
): Partial<AgenticConfig> {
    if (!ledgerPrimingEnabled()) return input;
    try {
        const ledger = readLedger(file);
        if (ledger.length === 0) return input; // no history => no priming (no-op)

        const best = bestFor(topic, { file });
        const sim = best ? topicSimilarity(topic, best.topic) : 0;
        const useBestGenome = !!best && sim >= NEAR_DUP_SIMILARITY;

        // The fill source: bestFor's whole genome for a near-duplicate, else the
        // consensus across similar high-scorers. When bestFor is null (its
        // threshold is stricter) we ALWAYS fall through to winningChoices.
        const fill: Partial<Record<PrimableField, unknown>> = useBestGenome && best
            ? toChoicesMap(best)
            : winningChoices(topic, { file });

        let source = '';
        if (useBestGenome && best) {
            source = `bestFor(near-dup sim=${sim.toFixed(2)} topic="${best.topic}")`;
        } else if (fill && Object.keys(fill).length > 0) {
            source = `winningChoices(consensus)`;
        }

        if (!source) return input; // nothing useful — clean no-op

        // Layer priming UNDER the user's explicit input: only copy a field when
        // the user did not already specify it.
        const primed: Partial<AgenticConfig> = { ...input };
        for (const f of PRIMABLE_FIELDS) {
            const userVal = (primed as any)[f];
            if (userVal === undefined && (fill as any)[f] !== undefined) {
                (primed as any)[f] = (fill as any)[f];
            }
        }
        // Audit trail so operators can see priming happened (and tests can assert).
        (primed as any).__ledgerPrimedFrom = source;
        return primed;
    } catch {
        return input; // never break a render over priming
    }
}

/** Human-readable summary of what priming did (for CLI / tests). */
export function describePriming(input: Partial<AgenticConfig>): string | null {
    const src = (input as any).__ledgerPrimedFrom;
    return typeof src === 'string' ? src : null;
}
