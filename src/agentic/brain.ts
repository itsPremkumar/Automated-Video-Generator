/**
 * brain.ts — the "agent brain" that makes advanced creative/technical decisions.
 *
 * Design rules (locked by project constraints):
 *  - FREE:   never requires a paid API. Uses a free model when a key/URL is
 *            provided (OpenRouter free tier, or a local Ollama model).
 *  - ONLINE: may call a free endpoint when network + key are available.
 *  - SAFE:   ALWAYS falls back to the existing heuristic when no model is
 *            configured, offline, rate-limited, or the call fails. The pipeline
 *            never crashes and never hangs on the model.
 *
 * Every method returns either a model-derived result or `null`. Callers MUST
 * fall back to the heuristic when the result is `null`.
 */

import { readFileSync } from 'fs';

export interface BrainOptions {
    /** OpenRouter API key (free tier). When set, text decisions use a free model. */
    openRouterKey?: string;
    /** OpenRouter model id. Defaults to a free model. */
    openRouterModel?: string;
    /** Local Ollama base URL (e.g. http://localhost:11434). Used if no OpenRouter key. */
    ollamaUrl?: string;
    /** Ollama model name (e.g. llama3.1). */
    ollamaModel?: string;
    /** Optional vision model id (OpenRouter) for image-relevance / QA checks. */
    visionModel?: string;
    /** Timeout (ms) per model call. Defaults to 20s. */
    timeoutMs?: number;
}

const DEFAULT_OR_MODEL = 'meta-llama/llama-3.1-8b-instruct:free';
const DEFAULT_VISION_MODEL = 'google/gemini-2.0-flash-thinking-exp-1219:free';

function envOpts(): BrainOptions {
    return {
        openRouterKey: process.env.OPENROUTER_API_KEY || undefined,
        openRouterModel: process.env.OPENROUTER_MODEL || DEFAULT_OR_MODEL,
        ollamaUrl: process.env.OLLAMA_URL || undefined,
        ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1',
        visionModel: process.env.OPENROUTER_VISION_MODEL || DEFAULT_VISION_MODEL,
        timeoutMs: Number(process.env.BRAIN_TIMEOUT_MS || 20000),
    };
}

function hasModel(o: BrainOptions): boolean {
    return Boolean(o.openRouterKey || o.ollamaUrl);
}

/** Call a free text model and parse JSON. Returns null on any failure. */
async function completeJSON<T>(o: BrainOptions, system: string, prompt: string, schemaHint: string): Promise<T | null> {
    if (!hasModel(o)) return null;
    const timeout = o.timeoutMs ?? 20000;
    try {
        if (o.openRouterKey) {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), timeout);
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${o.openRouterKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: o.openRouterModel ?? DEFAULT_OR_MODEL,
                    messages: [
                        { role: 'system', content: system + '\nReturn ONLY valid minified JSON matching this shape: ' + schemaHint },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.7,
                }),
                signal: ctrl.signal,
            } as any);
            clearTimeout(t);
            if (!res.ok) return null;
            const j = await res.json();
            const text = j?.choices?.[0]?.message?.content ?? '';
            return extractJSON<T>(text);
        }
        if (o.ollamaUrl) {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), timeout);
            const res = await fetch(`${o.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: o.ollamaModel ?? 'llama3.1',
                    messages: [
                        { role: 'system', content: system + '\nReturn ONLY valid minified JSON matching this shape: ' + schemaHint },
                        { role: 'user', content: prompt },
                    ],
                    format: 'json',
                    stream: false,
                }),
                signal: ctrl.signal,
            } as any);
            clearTimeout(t);
            if (!res.ok) return null;
            const j = await res.json();
            const text = j?.message?.content ?? '';
            return extractJSON<T>(text);
        }
    } catch {
        return null;
    }
    return null;
}

function extractJSON<T>(text: string): T | null {
    if (!text) return null;
    // Strip code fences if present.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : text;
    // Find the first balanced { } or [ ].
    const start = raw.search(/[[{]/);
    if (start < 0) return null;
    const open = raw[start];
    const close = open === '[' ? ']' : '}';
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < raw.length; i++) {
        const c = raw[i];
        if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === open) depth++;
        else if (c === close) { depth--; if (depth === 0) { try { return JSON.parse(raw.slice(start, i + 1)); } catch { return null; } } }
    }
    return null;
}

export class AgentBrain {
    private o: BrainOptions;
    constructor(opts?: BrainOptions) {
        this.o = opts ?? envOpts();
    }
    get modelEnabled(): boolean { return hasModel(this.o); }

    /** B1 — write an engaging, narrative-arc script. Falls back to heuristic. */
    async writeScript(topic: string, title: string): Promise<string | null> {
        const r = await completeJSON<{ script: string }>(this.o,
            'You are a short-form video scriptwriter. Write a tight, natural, engaging script with a hook, build, and payoff. 3-5 short sentences. No hashtags, no markup.',
            `Topic: ${topic}\nTitle: ${title}`,
            '{"script":"..."}');
        return r?.script?.trim() || null;
    }

    /** B2 — contextually rich, scene-specific search keywords. */
    async expandKeywords(sceneText: string, title: string, n = 5): Promise<string[] | null> {
        const r = await completeJSON<{ keywords: string[] }>(this.o,
            `You are a stock-media search expert. Given a scene's narration, return ${n} diverse, specific, visually-descriptive search queries (e.g. "barista pouring latte art", not "coffee nature"). No repeats.`,
            `Title: ${title}\nScene narration: ${sceneText}`,
            '{"keywords":["...","..."]}');
        const k = (r?.keywords || []).map((s) => s.trim()).filter(Boolean).slice(0, n);
        return k.length ? k : null;
    }

    /** B7 — match music to the video's emotional arc. */
    async deriveMusic(sceneTexts: string[], title: string): Promise<string | null> {
        const r = await completeJSON<{ query: string }>(this.o,
            'You are a music supervisor. Given a video\'s scenes, return ONE short free-stock-music search query (mood + genre + tempo) that fits the emotional arc and platform (short-form vertical).',
            `Title: ${title}\nScenes:\n${sceneTexts.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
            '{"query":"..."}');
        return r?.query?.trim() || null;
    }

    /** B10 — compelling, SEO-friendly metadata. */
    async generateMetadata(title: string, scenes: string[]): Promise<{ title: string; description: string; hashtags: string[] } | null> {
        const r = await completeJSON<{ title: string; description: string; hashtags: string[] }>(this.o,
            'You are a YouTube/Shorts SEO expert. Write a clickable title, a 2-3 sentence description, and 5-8 relevant hashtags.',
            `Working title: ${title}\nScenes:\n${scenes.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
            '{"title":"...","description":"...","hashtags":["...","..."]}');
        if (!r?.title) return null;
        return { title: r.title, description: r.description ?? '', hashtags: (r.hashtags || []).slice(0, 8) };
    }

    /** B5 — full narrative reorder (returns ordered scene indices). */
    async narrativeOrder(sceneTexts: string[]): Promise<number[] | null> {
        const r = await completeJSON<{ order: number[] }>(this.o,
            'You are a story editor. Given scene narrations (1-indexed), return the best viewing order for a hook→build→payoff→CTA arc. Output the 1-based indices in new order.',
            sceneTexts.map((s, i) => `${i + 1}. ${s}`).join('\n'),
            '{"order":[3,1,2,...]}');
        const order = (r?.order || []).map((n) => n - 1).filter((i) => i >= 0 && i < sceneTexts.length);
        if (order.length !== sceneTexts.length) return null;
        return order;
    }

    /**
     * B3 / B9 — vision check on a local image/video frame.
     * Uses the agent's OWN model when it is multimodal: either the OpenRouter
     * free vision model (if a key is set) OR a local Ollama vision model
     * (if ollamaUrl is set). Returns null when no multimodal model is
     * configured, offline, or the call fails — callers fall back to signal gates.
     * ZERO extra cost: no separate key, rides the running agent model.
     */
    async visionVerify(filePath: string, keywords: string[]): Promise<{ passes: boolean; confidence: number; reason: string } | null> {
        const hasVision = Boolean(this.o.openRouterKey && this.o.visionModel) || Boolean(this.o.ollamaUrl && this.o.ollamaModel);
        if (!hasVision) return null;
        try {
            const b64 = readFileSync(filePath).toString('base64');
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), this.o.timeoutMs ?? 20000);
            const isOR = Boolean(this.o.openRouterKey && this.o.visionModel);
            const url = isOR ? 'https://openrouter.ai/api/v1/chat/completions' : `${this.o.ollamaUrl!.replace(/\/$/, '')}/api/chat`;
            const headers: Record<string, string> = isOR
                ? { 'Authorization': `Bearer ${this.o.openRouterKey}`, 'Content-Type': 'application/json' }
                : { 'Content-Type': 'application/json' };
            const model = isOR ? this.o.visionModel! : this.o.ollamaModel!;
            const body: any = {
                model,
                messages: [
                    { role: 'system', content: 'You verify whether an image depicts the given subjects. Reply ONLY JSON {"passes":bool,"confidence":0-10,"reason":"..."}.' },
                    {
                        role: 'user',
                        content: isOR
                            ? [
                                { type: 'text', text: `Does this image depict: ${keywords.join(', ')}?` },
                                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
                            ]
                            : [
                                { role: 'user', content: `Does this image depict: ${keywords.join(', ')}?` },
                                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
                            ],
                    },
                ],
            };
            if (!isOR) { body.format = 'json'; body.stream = false; }
            const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal } as any);
            clearTimeout(t);
            if (!res.ok) return null;
            const j = await res.json();
            const text = isOR ? (j?.choices?.[0]?.message?.content ?? '') : (j?.message?.content ?? '');
            return extractJSON<{ passes: boolean; confidence: number; reason: string }>(text);
        } catch {
            return null;
        }
    }

    /** Key-free text completion (rides the agent's own model). Exposed for
     *  audio/transcript QA in ai-verify.ts. Returns null on any failure. */
    completeJSON<T>(system: string, prompt: string, schemaHint: string): Promise<T | null> {
        return completeJSON<T>(this.o, system, prompt, schemaHint);
    }
}
