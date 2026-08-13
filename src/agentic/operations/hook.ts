/**
 * hook.ts — AI hook / retention optimizer (Feature 3).
 *
 * A short, punchy "first-3-seconds" hook dramatically improves watch-through.
 * This module rewrites the OPENING line of the script for retention, and is
 * OPTIONAL and OFF by default:
 *   - If `optimizeHook` config flag is false OR no LLM is configured, a
 *     deterministic HEURISTIC rewrite runs (no network, no key).
 *   - If `optimizeHook` is true AND an AgentBrain provider is available, the
 *     LLM produces a stronger hook. Any failure falls back to the heuristic.
 *
 * Nothing here can break a run: every path returns a usable string.
 */
import type { AgentBrain } from '../ai/brain.js';

export interface HookResult {
    hook: string;
    method: 'heuristic' | 'llm';
    note?: string;
}

const HOOK_OPENERS = [
    'Stop scrolling',
    'Wait — this changes everything',
    'Most people get this wrong',
    'Here is the truth nobody tells you',
    'You are probably doing this wrong',
    'One simple trick',
    'Quick question',
];

/** Deterministic, offline hook rewrite — no key, no network. */
export function heuristicHook(originalFirstLine: string): string {
    const base = (originalFirstLine || '').trim().replace(/\s+/g, ' ');
    if (!base) return 'Stop scrolling — this is worth 30 seconds.';
    const opener = HOOK_OPENERS[Math.abs(hashString(base)) % HOOK_OPENERS.length];
    // Strip a leading weak opener if the line already starts with one.
    const stripped = base.replace(/^(so,?|well,?|today,?|in this video,?|hi,?|hello,?)\s*/i, '');
    const trimmed = stripped.length > 140 ? stripped.slice(0, 137).trimEnd() + '…' : stripped;
    return `${opener}: ${trimmed.charAt(0).toUpperCase() + trimmed.slice(1)}`;
}

function hashString(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
}

/**
 * Optimize the opening hook. `brain` is optional; when present AND the caller
 * asked for LLM, we attempt an LLM rewrite but always fall back to heuristic.
 */
export async function optimizeHook(
    originalFirstLine: string,
    opts: { useLlm?: boolean; brain?: AgentBrain },
): Promise<HookResult> {
    const heuristic = heuristicHook(originalFirstLine);
    if (!opts.useLlm || !opts.brain) {
        return { hook: heuristic, method: 'heuristic' };
    }
    try {
        const json = await opts.brain.completeJSONTask<{ hook: string }>(
            'You write one ultra-punchy first-3-seconds YouTube/video hook. Return JSON {"hook":string}. ' +
                'No preamble, no quotes in the value. Max 140 chars. High curiosity, no clickbait lies.',
            `Script opening line: ${originalFirstLine || '(none)'}`,
            '{"hook":"..."}',
        );
        const llm = json?.hook;
        if (typeof llm === 'string' && llm.trim().length > 0) {
            return { hook: llm.trim().slice(0, 160), method: 'llm' };
        }
        return { hook: heuristic, method: 'heuristic', note: 'LLM returned no hook' };
    } catch (e) {
        return { hook: heuristic, method: 'heuristic', note: `LLM failed: ${(e as Error)?.message ?? e}` };
    }
}
