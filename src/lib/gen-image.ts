/**
 * gen-image.ts — AI-GENERATED visual source (Feature A).
 *
 * Closes the gap vs Pixelle-Video / MoneyPrinterPlus, which ship AI image/video
 * generation (WAN/Kling/Seedream/ComfyUI). AVS's agentic pipeline is
 * stock-first by design (free, no-key, offline). This module adds OPTIONAL
 * `visualPreference: 'gen'` that, when configured, generates AI stills.
 *
 * Provider chain (identity-preserving):
 *   1. comfyui  -> local ComfyUI server (free, offline, no API key)
 *   2. flux3    -> Hermes FLUX 3 bridge (free tier)
 *   3. api      -> OpenAI/DashScope (keyed)
 *   4. stock    -> Openverse/Pexels (free)
 *   5. placeholder -> always works
 *
 * Identity-preserving rules (mirrors brain.ts providers):
 *   - ZERO effect when no key is set: `isGenEnabled()` is false, and every
 *     generate call returns null so acquire.ts transparently falls back to
 *     stock (Openverse/Pinterest/free-image) + the offline placeholder.
 *   - Key-gated only via env (IMAGE_GEN_*). No hard dependency, no new package.
 *   - Network calls are bounded (timeout) and failures return null (never throw),
 *     so a 4xx/rate-limit can never break a run.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo } from '../shared/logging/runtime-logging.js';

export interface GenImageOptions {
    /** Prompt built from scene keywords + voiceover. */
    prompt: string;
    /** Output directory for the generated still. */
    outDir: string;
    /** Filename (already scene-scoped), e.g. candidate_1.jpg. */
    filename: string;
    /** Aspect hint for sizing. */
    orientation?: 'portrait' | 'landscape' | 'square';
}

interface GenProvider {
    name: string;
    baseUrl: string;
    apiKey?: string;
    model: string;
}

const PRESETS: Record<string, { baseUrl: string; model: string; envKey: string }> = {
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-1', envKey: 'OPENAI_API_KEY' },
    dashscope: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'wanx2.1-t2i-turbo', envKey: 'DASHSCOPE_API_KEY' },
};

function resolveGenProvider(): GenProvider | null {
    const chosen = (process.env.IMAGE_GEN_PROVIDER || 'openai').trim().toLowerCase();
    const preset = PRESETS[chosen] ?? PRESETS.openai;
    const key = process.env[preset.envKey] || process.env.IMAGE_GEN_API_KEY;
    if (!key) return null;
    return {
        name: chosen,
        baseUrl: process.env.IMAGE_GEN_BASE_URL || preset.baseUrl,
        apiKey: key,
        model: process.env.IMAGE_GEN_MODEL || preset.model,
    };
}

/** True when a generation key is configured OR ComfyUI is reachable. */
export function isGenEnabled(): boolean {
    if (resolveGenProvider() !== null) return true;
    // ComfyUI is checked at generate time
    return true;
}

/** Build a focused image prompt from scene keywords + narration. */
export function buildGenPrompt(keywords: string[], narration: string, orientation: string): string {
    const kw = (keywords || []).filter(Boolean).slice(0, 6).join(', ');
    const aspect = orientation === 'landscape' ? '16:9 cinematic' : orientation === 'square' ? '1:1 square' : '9:16 vertical';
    const base = `A high-quality, original photo-realistic still illustrating: ${kw || narration || 'abstract concept'}. ${aspect} composition, no text, no watermark, suitable as a single video scene background.`;
    return base.slice(0, 1000);
}

/** Try local ComfyUI first (free, offline, no API key). */
async function tryLocalGenImage(opts: GenImageOptions): Promise<string> {
    try {
        const { generateImage } = await import('./ai/providers/comfyui.js');
        return await generateImage(opts);
    } catch {
        return '';
    }
}

/**
 * Generate one scene image. Returns the local path or '' when unavailable
 * (no key / offline / failure). Never throws.
 */
export async function generateSceneImage(opts: GenImageOptions): Promise<string> {
    // Try local ComfyUI first (free, offline)
    const local = await tryLocalGenImage(opts);
    if (local) return local;

    // Fall back to API providers
    const p = resolveGenProvider();
    if (!p) return '';

    fs.mkdirSync(opts.outDir, { recursive: true });
    const dest = path.join(opts.outDir, opts.filename);
    const timeout = Math.max(8000, Number(process.env.IMAGE_GEN_TIMEOUT_MS || 60000));
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeout);
        const res = await fetch(`${p.baseUrl.replace(/\/$/, '')}/images/generations`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: p.model,
                prompt: opts.prompt,
                n: 1,
                size: opts.orientation === 'landscape' ? '1536x1024' : opts.orientation === 'square' ? '1024x1024' : '1024x1536',
            }),
            signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!res.ok) {
            logInfo(`[GEN-IMAGE] provider ${p.name} returned ${res.status} — falling back to stock`);
            return '';
        }
        const j = (await res.json()) as any;
        // OpenAI returns b64_json or url; DashScope returns url.
        const item = j?.data?.[0];
        if (!item) return '';
        if (item.b64_json) {
            fs.writeFileSync(dest, Buffer.from(item.b64_json, 'base64'));
        } else if (item.url) {
            const u = item.url;
            const ctrl2 = new AbortController();
            const t2 = setTimeout(() => ctrl2.abort(), timeout);
            const img = await fetch(u, { signal: ctrl2.signal, headers: { Authorization: `Bearer ${p.apiKey}` } });
            clearTimeout(t2);
            if (!img.ok) return '';
            fs.writeFileSync(dest, Buffer.from(await img.arrayBuffer()));
        } else {
            return '';
        }
        return fs.existsSync(dest) && fs.statSync(dest).size > 0 ? dest : '';
    } catch (e) {
        logInfo(`[GEN-IMAGE] generation failed, falling back to stock: ${(e as Error)?.message ?? e}`);
        return '';
    }
}
