/**
 * ai/intelligence/script-enhance.ts — local LLM script enhancement.
 *
 * Optimizes input scripts for engagement using a local LLM (Ollama).
 * Adds hooks, pacing cues, and emphasis markers.
 *
 * Identity-preserving: returns original script if enhancement fails.
 */

import * as fs from 'fs';
import { logInfo } from '../../../shared/logging/runtime-logging.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_SCRIPT_MODEL || 'qwen2.5:7b';
const ENHANCE_TIMEOUT = Math.max(15000, Number(process.env.ENHANCE_TIMEOUT_MS || 120000));

export interface EnhancedScript {
    title: string;
    hook: string;
    scenes: EnhancedScene[];
    emphasisWords: string[];
}

export interface EnhancedScene {
    voiceoverText: string;
    searchKeywords: string[];
    visualHint: string;
    pacing: 'fast' | 'medium' | 'slow';
}

/** Check if script enhancement is available. */
export function isEnabled(): boolean {
    return true; // availability checked at generate time
}

/** Check if Ollama is reachable. */
export async function isAvailable(): Promise<boolean> {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
        clearTimeout(t);
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Enhance a script for better engagement.
 * Returns enhanced script or null on failure.
 */
export async function enhance(opts: {
    title: string;
    script: string;
    platform?: 'youtube' | 'shorts' | 'tiktok';
}): Promise<EnhancedScript | null> {
    if (!await isAvailable()) {
        logInfo('[SCRIPT-ENHANCE] Ollama not reachable — skipping');
        return null;
    }

    const prompt = buildEnhancementPrompt(opts);

    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), ENHANCE_TIMEOUT);
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                prompt,
                stream: false,
                format: 'json',
                options: { temperature: 0.7 },
            }),
            signal: ctrl.signal,
        });
        clearTimeout(t);

        if (!res.ok) {
            logInfo(`[SCRIPT-ENHANCE] Ollama returned ${res.status}`);
            return null;
        }

        const json = await res.json();
        const text = json?.response;
        if (!text) return null;

        return JSON.parse(text) as EnhancedScript;
    } catch (e: any) {
        logInfo(`[SCRIPT-ENHANCE] Failed: ${e?.message ?? e}`);
        return null;
    }
}

function buildEnhancementPrompt(opts: any): string {
    const platform = opts.platform || 'youtube';
    return `You are an expert ${platform} script writer. Rewrite the following script for maximum engagement.

Return a JSON object with:
- title: catchy title (under 60 chars)
- hook: opening line (first 5 seconds, must grab attention)
- scenes: array of objects with:
  - voiceoverText: narration for this scene
  - searchKeywords: 3-5 visual search keywords
  - visualHint: brief description of what should be shown
  - pacing: "fast" | "medium" | "slow"
- emphasisWords: words that should be visually emphasized (pop-on-beat)

Script to enhance:
${opts.script}

Return ONLY valid JSON. No explanation.`;
}
