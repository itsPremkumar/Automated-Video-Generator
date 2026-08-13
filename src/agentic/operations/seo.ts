/**
 * seo.ts — YouTube SEO metadata writer (Feature 4, part A).
 *
 * Produces an optimized title, description, and tags for a finished video.
 * OPTIONAL + OFF by default:
 *   - If `seo` config flag is false OR no LLM is configured, a deterministic
 *     HEURISTIC derives SEO-friendly metadata (keyword-rich title, structured
 *     description, hashtag set) — no network, no key.
 *   - If `seo` is true AND an AgentBrain provider is available, the LLM writes
 *     stronger metadata. Any failure falls back to the heuristic.
 */
import type { AgentBrain } from '../ai/brain.js';

export interface SeoInput {
    topic: string;
    title: string;
    script: string;
    hashtags?: string;
}

export interface SeoResult {
    title: string;
    description: string;
    tags: string[];
    method: 'heuristic' | 'llm';
}

function topKeywords(text: string, n: number): string[] {
    const stop = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'for', 'is', 'are', 'you', 'your', 'with', 'this', 'that', 'it', 'as', 'at', 'by', 'from']);
    const words = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !stop.has(w));
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0]);
}

export function heuristicSeo(input: SeoInput): SeoResult {
    const kw = topKeywords(`${input.topic} ${input.title} ${input.script}`, 6);
    const title = `${input.title} | ${kw.slice(0, 3).map((k) => k[0].toUpperCase() + k.slice(1)).join(' ')}`.slice(0, 100);
    const desc = `${input.title}\n\n${input.script.slice(0, 280).trim()}${input.script.length > 280 ? '…' : ''}\n\n${kw.map((k) => `#${k}`).join(' ')}`;
    return { title, description: desc, tags: kw, method: 'heuristic' };
}

export async function optimizeSeo(input: SeoInput, opts: { useLlm?: boolean; brain?: AgentBrain }): Promise<SeoResult> {
    const heuristic = heuristicSeo(input);
    if (!opts.useLlm || !opts.brain) return heuristic;
    try {
        const json = await opts.brain.completeJSONTask<{ title: string; description: string; tags: string[] }>(
            'You are a YouTube SEO expert. Return JSON {"title":string,"description":string,"tags":string[]}. ' +
                'Title <=100 chars, keyword-rich, clickable. Description <=500 chars with hashtags. 5-8 tags.',
            `Topic: ${input.topic}\nTitle: ${input.title}\nScript: ${input.script.slice(0, 600)}`,
            '{"title":"...","description":"...","tags":["...","..."]}',
        );
        if (json && json.title && json.description && Array.isArray(json.tags)) {
            return {
                title: json.title.slice(0, 100),
                description: json.description.slice(0, 500),
                tags: json.tags.slice(0, 8).map((t) => String(t).replace(/^#/, '')),
                method: 'llm',
            };
        }
        return heuristic;
    } catch {
        return heuristic;
    }
}
