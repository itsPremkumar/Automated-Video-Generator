/**
 * Keyword parsing and Gemini-based keyword optimization utilities.
 */

export const geminiWaitQueue: Array<() => void> = [];
export const ollamaWaitQueue: Array<() => void> = [];

export function normalizeKeywordList(value: unknown): string[] {
    if (!value) return [];
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
        } catch {
            // not JSON — split by common delimiters
        }
        return value
            .split(/[,;|]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
    }
    if (Array.isArray(value)) {
        return value.map(String).filter((s) => s.trim().length > 0);
    }
    return [];
}

export function parseGeminiKeywordResponse(responseText: string): string[] {
    if (!responseText) return [];
    const trimmed = responseText.trim();
    // Try JSON parse first
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
            if (parsed.keywords && Array.isArray(parsed.keywords)) return parsed.keywords.map(String).filter(Boolean);
        } catch {
            // fall through
        }
    }
    // Try extracting from markdown code blocks
    const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[1].trim());
            if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
            if (parsed.keywords && Array.isArray(parsed.keywords)) return parsed.keywords.map(String).filter(Boolean);
        } catch {
            // fall through
        }
    }
    // Fallback: split by newlines or commas
    return trimmed
        .split(/[\n,]+/)
        .map((s) => s.replace(/^\d+[. )-]*/, '').trim())
        .filter((s) => s.length > 0 && !s.startsWith('{') && !s.startsWith('['));
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
