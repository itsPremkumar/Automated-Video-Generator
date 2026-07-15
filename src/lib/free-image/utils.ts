import * as path from 'path';
import * as fs from 'fs';

export function sanitizeFilename(name: string): string {
    return (
        name
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 200) || 'untitled'
    );
}

export function formatBytes(bytes: number): string {
    const abs = Math.abs(bytes);
    if (abs === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(abs) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export async function withRetry<T>(
    fn: (signal?: AbortSignal) => Promise<T>,
    options: { retries: number; baseDelayMs: number; label?: string; signal?: AbortSignal },
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= options.retries; attempt++) {
        if (options.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
        try {
            return await fn(options.signal);
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            lastError = err;
            if (attempt < options.retries) {
                const jitter = Math.random() * 0.3 + 0.85; // 0.85-1.15x jitter
                const delay = options.baseDelayMs * Math.pow(2, attempt) * jitter;
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}
