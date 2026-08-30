/**
 * research.ts — Research phase for onetake.
 *
 * The onetake module doesn't do web search directly — it accepts a
 * `ResearchProvider` callback that the MCP layer wires to the agent's
 * web_search tool. This keeps the module testable and decoupled.
 *
 * For standalone CLI use, a fallback provider using DuckDuckGo's
 * instant answer API is included (no key required).
 */
import { logInfo, logWarn } from '../../shared/logging/runtime-logging.js';
import type { ResearchFact } from './types.js';

export type ResearchProvider = (query: string, maxResults: number) => Promise<ResearchFact[]>;

export interface ResearchResult {
    facts: ResearchFact[];
    offline: boolean;
    query: string;
}

/**
 * Run research for a topic using the provided search function.
 * Falls back to offline mode if the provider throws or returns nothing.
 */
export async function researchTopic(
    topic: string,
    provider: ResearchProvider | undefined,
    maxResults: number = 5,
): Promise<ResearchResult> {
    const query = topic;
    logInfo(`[ONETAKE] Researching topic: "${query}"`);

    if (!provider) {
        logWarn('[ONETAKE] No research provider wired — offline mode');
        return { facts: [], offline: true, query };
    }

    try {
        const facts = await provider(query, maxResults);
        if (!facts || facts.length === 0) {
            logWarn('[ONETAKE] Research returned no facts — offline mode');
            return { facts: [], offline: true, query };
        }
        logInfo(`[ONETAKE] Research complete: ${facts.length} facts`);
        return { facts, offline: false, query };
    } catch (e: any) {
        logWarn(`[ONETAKE] Research failed (${e?.message ?? e}) — offline mode`);
        return { facts: [], offline: true, query };
    }
}

/**
 * Default research provider for standalone CLI usage.
 * Uses DuckDuckGo's instant answer API (no key required).
 * Returns [] if the API is unreachable so the pipeline degrades gracefully.
 */
export function duckDuckGoProvider(): ResearchProvider {
    return async (query: string, maxResults: number): Promise<ResearchFact[]> => {
        const url = `https://api.duckduck.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) return [];
            const data = await res.json();
            const facts: ResearchFact[] = [];

            if (data.AbstractText) {
                facts.push({
                    url: data.AbstractURL ?? `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                    title: data.Heading ?? query,
                    snippet: data.AbstractText,
                    source: 'DuckDuckGo',
                });
            }

            if (Array.isArray(data.RelatedTopics)) {
                for (const rt of data.RelatedTopics.slice(0, maxResults - facts.length)) {
                    if (rt.Text) {
                        facts.push({
                            url: rt.FirstURL ?? '',
                            title: rt.Text.slice(0, 60),
                            snippet: rt.Text,
                            source: 'DuckDuckGo',
                        });
                    }
                }
            }

            return facts.slice(0, maxResults);
        } catch {
            return [];
        } finally {
            clearTimeout(timer);
        }
    };
}

/**
 * Convert research facts into a compact string for script injection.
 */
export function factsToScriptHints(facts: ResearchFact[]): string[] {
    return facts.map((f, i) => {
        const snippet = f.snippet.slice(0, 120).replace(/\n/g, ' ');
        return `Fact ${i + 1} (${f.source}): ${snippet}`;
    });
}

/**
 * Extract SEO-friendly hashtags from research facts.
 */
export function factsToHashtags(facts: ResearchFact[], maxTags: number = 8): string[] {
    const stopwords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
        'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
        'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
        'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
        'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
        'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
        'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
        'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up',
        'its', 'it', 'this', 'that', 'these', 'those', 'what', 'which', 'who',
        'whom', 's', 't', 'd', 'll', 've', 're', 'm',
    ]);

    const wordFreq = new Map<string, number>();
    for (const f of facts) {
        const text = `${f.title} ${f.snippet}`.toLowerCase();
        const words = text.match(/\b[a-z]{3,15}\b/g) ?? [];
        for (const w of words) {
            if (stopwords.has(w)) continue;
            wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
        }
    }

    return [...wordFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxTags)
        .map(([word]) => `#${word}`);
}

/**
 * Build a 2-3 sentence description from research facts.
 */
export function factsToDescription(facts: ResearchFact[], topic: string): string {
    if (facts.length === 0) {
        return `A short video about ${topic}.`;
    }
    const top = facts.slice(0, 3);
    const sentences = top.map((f) => {
        const s = f.snippet.replace(/\s+/g, ' ').trim();
        return s.length > 120 ? s.slice(0, 117) + '...' : s;
    });
    return sentences.join(' ');
}