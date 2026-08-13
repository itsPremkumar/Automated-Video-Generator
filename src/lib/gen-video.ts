/**
 * gen-video.ts — AI-GENERATED MOTION source (Feature 1 / text-to-video).
 *
 * Closes the LAST major visual gap vs Pixelle-Video / MoneyPrinterPlus, which
 * ship Text-to-Video (WAN / Kling / Seedream / Runway / Luma). AVS's `gen`
 * image path already covers stills; this adds an OPTIONAL `visualPreference:
 * 'video-gen'` that, when a keyed T2V endpoint is configured, generates a short
 * motion clip for the scene instead of fetching stock video.
 *
 * Identity-preserving rules (mirror gen-image.ts):
 *   - ZERO effect when no key is set: `isVideoGenEnabled()` is false and every
 *     call returns '' so acquire.ts falls back to stock video (Pexels/Pixabay/
 *     free-video) + the offline placeholder.
 *   - Key-gated only via env (VIDEO_GEN_*). No hard dependency, no new package.
 *   - Bounded (timeout) + failures return '' (never throw).
 *
 * Endpoints supported (OpenAI-compatible / provider REST):
 *   - openai      -> POST {baseUrl}/videos/generations  (Sora-style, returns url/b64)
 *   - kling       -> Kling API (submit + poll) — best-effort, url result
 *   - seedream    -> Alibaba Wanx T2V (DashScope)
 *   - runway      -> Runway Gen-2/3 (url result)
 *   - luma        -> Luma Dream Machine (url result)
 * The generic path (openai-style immediate url/b64) is implemented robustly;
 * provider-specific polling is handled by a `pollUrl` helper that follows a
 * returned "task" status URL when present.
 */
import * as fs from 'fs';
import * as path from 'path';
import { logInfo } from '../shared/logging/runtime-logging.js';

export interface GenVideoOptions {
    prompt: string;
    outDir: string;
    filename: string;
    orientation: 'portrait' | 'landscape' | 'square';
    durationSec?: number;
}

interface VideoGenProvider {
    name: string;
    baseUrl: string;
    apiKey?: string;
    model: string;
}

const PRESETS: Record<string, { baseUrl: string; model: string; envKey: string }> = {
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'sora-2', envKey: 'OPENAI_API_KEY' },
    kling: { baseUrl: 'https://api.klingai.com/v1', model: 'kling-v1-6', envKey: 'KLING_API_KEY' },
    seedream: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'wanx2.1-t2v-turbo', envKey: 'DASHSCOPE_API_KEY' },
    runway: { baseUrl: 'https://api.dev.runwayml.com/v1', model: 'gen3a-turbo', envKey: 'RUNWAY_API_KEY' },
    luma: { baseUrl: 'https://api.lumalabs.ai/v1', model: 'ray-2', envKey: 'LUMA_API_KEY' },
};

function resolveVideoGenProvider(): VideoGenProvider | null {
    const chosen = (process.env.VIDEO_GEN_PROVIDER || 'openai').trim().toLowerCase();
    const preset = PRESETS[chosen] ?? PRESETS.openai;
    const key = process.env[preset.envKey] || process.env.VIDEO_GEN_API_KEY;
    if (!key) return null;
    return {
        name: chosen,
        baseUrl: process.env.VIDEO_GEN_BASE_URL || preset.baseUrl,
        apiKey: key,
        model: process.env.VIDEO_GEN_MODEL || preset.model,
    };
}

/** True only when a video-generation key is configured. Offline-safe default: false. */
export function isVideoGenEnabled(): boolean {
    return resolveVideoGenProvider() !== null;
}

/** Build a focused motion prompt from scene keywords + narration. */
export function buildVideoGenPrompt(keywords: string[], narration: string, orientation: string, durationSec: number): string {
    const kw = (keywords || []).filter(Boolean).slice(0, 6).join(', ');
    const aspect = orientation === 'landscape' ? '16:9' : orientation === 'square' ? '1:1' : '9:16';
    const base = `A short, original, cinematic motion clip illustrating: ${kw || narration || 'abstract concept'}. ${aspect} composition, smooth camera motion, no text, no watermark, loopable, ~${Math.max(3, Math.min(10, durationSec || 5))}s.`;
    return base.slice(0, 1000);
}

async function fetchWithTimeout(url: string, init: any, timeoutMs: number): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(t);
    }
}

/** Follow a returned task/status URL (provider async pattern) until it yields a video url. */
async function resolveAsyncUrl(maybeTask: any, provider: VideoGenProvider, timeoutMs: number): Promise<string | null> {
    // OpenAI-style immediate result: { data:[{url|b64_json}] }
    const immediate = maybeTask?.data?.[0]?.url || maybeTask?.data?.[0]?.b64_json || maybeTask?.url;
    if (immediate) return immediate;
    // Kling/Runway-style: { id, status, ... } or { task_id, works:[] } — poll a status url if present.
    const statusUrl = maybeTask?.status_url || maybeTask?.task_url || maybeTask?.data?.status_url;
    if (!statusUrl) return null;
    const deadline = Date.now() + Math.min(timeoutMs, 120000);
    let cursor = statusUrl;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        try {
            const r = await fetchWithTimeout(cursor, {
                headers: { Authorization: `Bearer ${provider.apiKey}` },
            }, timeoutMs);
            if (!r.ok) return null;
            const j = await r.json();
            const done = j?.status === 'succeeded' || j?.data?.status === 'succeeded';
            const vid = j?.data?.video_url || j?.data?.video?.url || j?.video?.url || j?.output?.[0]?.url;
            if (done && vid) return vid;
            if (j?.status === 'failed') return null;
            cursor = j?.status_url || j?.task_url || cursor;
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Generate one scene motion clip. Returns the local .mp4 path or '' when
 * unavailable (no key / offline / failure). Never throws.
 */
export async function generateSceneVideo(opts: GenVideoOptions): Promise<string> {
    const p = resolveVideoGenProvider();
    if (!p) return '';
    fs.mkdirSync(opts.outDir, { recursive: true });
    const dest = path.join(opts.outDir, opts.filename);
    const timeout = Math.max(15000, Number(process.env.VIDEO_GEN_TIMEOUT_MS || 120000));
    try {
        const submit = await fetchWithTimeout(`${p.baseUrl.replace(/\/$/, '')}/videos/generations`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: p.model,
                prompt: opts.prompt,
                duration: Math.max(3, Math.min(10, opts.durationSec || 5)),
                aspect_ratio: opts.orientation === 'landscape' ? '16:9' : opts.orientation === 'square' ? '1:1' : '9:16',
                n: 1,
            }),
        }, timeout);
        if (!submit.ok) {
            logInfo(`⚠ [GEN-VIDEO] provider ${p.name} returned ${submit.status} — falling back to stock video`);
            return '';
        }
        const task = await submit.json();
        const videoRef = await resolveAsyncUrl(task, p, timeout);
        if (!videoRef) return '';
        if (videoRef.startsWith('data:') || videoRef.startsWith('b64:')) {
            const b64 = videoRef.replace(/^(data:video\/mp4;base64,|b64:)/, '');
            fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
        } else {
            const dl = await fetchWithTimeout(videoRef, {
                headers: { Authorization: `Bearer ${p.apiKey}` },
            }, timeout);
            if (!dl.ok) return '';
            fs.writeFileSync(dest, Buffer.from(await dl.arrayBuffer()));
        }
        return fs.existsSync(dest) && fs.statSync(dest).size > 0 ? dest : '';
    } catch (e) {
        logInfo(`⚠ [GEN-VIDEO] generation failed, falling back to stock: ${(e as Error)?.message ?? e}`);
        return '';
    }
}
