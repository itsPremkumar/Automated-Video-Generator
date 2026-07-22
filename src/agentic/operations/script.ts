/**
 * script.ts — write_script single-task op. Generates a short-form video script
 * from a topic. ZERO-COST: uses AgentBrain when a free model is configured,
 * else a deterministic heuristic. New standalone module.
 */

import { AgentBrain } from '../ai/brain.js';
import { envOpts, hasModel } from '../ai/brain.js';

export interface ScriptResult {
    ok: boolean;
    script?: string;
    detail: string;
}

/**
 * Write a tight, hook→build→payoff script for `topic`.
 * Falls back to a rule-based template when no model is configured / offline.
 */
export async function writeScript(topic: string, voice?: string): Promise<ScriptResult> {
    const clean = (topic || '').trim();
    if (!clean) return { ok: false, detail: 'write_script needs a topic' };

    const brain = new AgentBrain(envOpts());
    if (hasModel(envOpts())) {
        try {
            const r = await brain.writeScript?.(clean, clean);
            if (r && r.length > 10) {
                return { ok: true, script: r, detail: `script generated (model) for "${clean}"` };
            }
        } catch {
            /* fall to heuristic */
        }
    }

    const t = clean.replace(/\.$/, '');
    const script = [
        `Did you know ${t} is changing faster than you think?`,
        `Here's the part most people miss about ${t}.`,
        `The truth is, ${t} rewards the ones who start early.`,
        `So if you're curious about ${t}, this is your sign to dig deeper.`,
    ].join(' ');
    return { ok: true, script, detail: `script generated (heuristic) for "${clean}"` };
}
