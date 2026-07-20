/**
 * script.ts - WRITE A SCRIPT from a topic (single task). 100% FREE.
 * Uses writeScriptHeuristic (no API key, no network). No OpenAI/Gemini required.
 */
import * as fs from 'fs';
import * as path from 'path';
import { writeScriptHeuristic } from '../ai/agent.js';

export interface ScriptResult {
    ok: boolean;
    script?: string;
    path?: string;
    detail: string;
}

const HOOKS = [
    'Did you know that',
    'Here is something most people miss:',
    'Let me show you why this matters.',
    'The secret is simpler than you think.',
];
const OUTROS = [
    'If this helped, save it for later.',
    'Follow for more like this.',
    'Try it today and see the difference.',
];

export async function writeScript(topic: string, out?: string): Promise<ScriptResult> {
    const t = (topic || '').trim();
    if (!t) return { ok: false, detail: 'A topic is required to write a script.' };

    const body = writeScriptHeuristic(t, t);
    const hook = HOOKS[Math.floor(Math.random() * HOOKS.length)];
    const outro = OUTROS[Math.floor(Math.random() * OUTROS.length)];
    const script = [
        `# ${t.charAt(0).toUpperCase() + t.slice(1)}`,
        '',
        `[HOOK] ${hook} ${body.split('\n')[0] ?? ''}`,
        '',
        '[BODY]',
        body,
        '',
        `[OUTRO] ${outro}`,
        '',
        '[CTA] Like, comment, and subscribe.',
    ].join('\n');

    if (out) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, script);
        return { ok: true, script, path: out, detail: `Script written to ${out}` };
    }
    return { ok: true, script, detail: 'Script generated (heuristic, no API key).' };
}
