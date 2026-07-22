/**
 * Keyword parsing and Gemini-based keyword optimization utilities.
 */

export const geminiWaitQueue: Array<() => void> = [];
export const ollamaWaitQueue: Array<() => void> = [];

export function normalizeKeywordList(value: unknown): string[] {
    if (!value) return [];
    let raw: unknown[];
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                raw = parsed;
            } else {
                // Not an array — treat as a non-keyword string.
                return [];
            }
        } catch {
            // not valid JSON — treat as a non-keyword string.
            return [];
        }
    } else if (Array.isArray(value)) {
        raw = value;
    } else {
        return [];
    }
    // Keep only actual string values, trim, dedupe case-insensitively, cap at 3.
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of raw) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (trimmed.length === 0) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(trimmed);
        if (result.length >= 3) break;
    }
    return result;
}

export function parseGeminiKeywordResponse(responseText: string): string[] {
    if (!responseText) return [];
    const trimmed = responseText.trim();

    // Extract a JSON array from anywhere in the text (prose, or fenced block).
    const extractArray = (text: string): string[] | null => {
        const match = text.match(/\[[\s\S]*?\]/);
        if (!match) return null;
        try {
            const parsed = JSON.parse(match[0]);
            if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
        } catch {
            // not valid JSON — ignore
        }
        return null;
    };

    // 1) Direct JSON parse (bare array or {keywords:[...]} object).
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
            if (parsed.keywords && Array.isArray(parsed.keywords)) return parsed.keywords.map(String).filter(Boolean);
        } catch {
            // fall through
        }
    }
    // 2) Fenced ```json blocks.
    const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        const fromFence = extractArray(jsonMatch[1].trim());
        if (fromFence) return fromFence;
    }
    // 3) Array embedded in surrounding prose.
    const fromProse = extractArray(trimmed);
    if (fromProse) return fromProse;
    // 4) Unparseable prose — no keywords.
    return [];
}

export function shouldRetryGeminiRequest(error: unknown): boolean {
    if (!error) return false;
    const msg = String(error);
    // Retry on rate limits, network issues, server errors
    if (msg.includes('429') || msg.includes('Too Many Requests')) return true;
    if (msg.includes('500') || msg.includes('502') || msg.includes('503')) return true;
    if (msg.includes('timeout') || msg.includes('TIMEOUT') || msg.includes('timed out')) return true;
    if (msg.includes('ECONNRESET') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) return true;
    if (msg.includes('socket') || msg.includes('Socket')) return true;
    if (msg.includes('rate_limit') || msg.includes('quota')) return true;
    return false;
}

export function formatGeminiError(error: unknown): string {
    if (!error) return 'unknown error';
    const msg = String(error);
    // Try to extract a meaningful message from axios error objects
    if (typeof error === 'object' && error !== null) {
        const e = error as any;
        if (e.response?.data?.error?.message) return String(e.response.data.error.message);
        if (e.message) return String(e.message);
    }
    return msg.slice(0, 500);
}
