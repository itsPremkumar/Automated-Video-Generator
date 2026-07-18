/**
 * retry.ts — bounded retry with exponential backoff + jitter.
 *
 * Use for transient failures on external calls (asset fetch, TTS, API). Never
 * retries on programming errors that will always fail; callers decide via
 * `shouldRetry`. Guarantees the total wait is bounded by retryCount.
 */

export interface RetryOptions {
    /** max attempts (incl. first). Default 3. */
    retries?: number;
    /** base backoff ms. Default 500. */
    baseMs?: number;
    /** max backoff ms (cap). Default 8000. */
    maxMs?: number;
    /** jitter factor 0..1 (random additional delay). Default 0.3. */
    jitter?: number;
    /** label for logs. */
    label?: string;
    /** return true to retry this error, false to bail immediately. */
    shouldRetry?: (err: unknown) => boolean;
}

const isRetryable = (err: unknown): boolean => {
    // Network / transient classes we should retry on.
    if (err && typeof err === 'object') {
        const e = err as Record<string, unknown>;
        const code = String(e.code ?? '');
        if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNABORTED'].includes(code)) return true;
        if (typeof e.message === 'string' && /timeout|reset|aborted|network|econn/i.test(e.message)) return true;
        if (e.name === 'FetchError' || e.name === 'AxiosError' || e.name === 'TimeoutError') return true;
    }
    // undefined err (e.g. empty response) → retryable by default.
    return err == null;
};

export async function withRetry<T>(
    fn: () => Promise<T>,
    opts: RetryOptions = {},
): Promise<T> {
    const retries = Math.max(1, opts.retries ?? 3);
    const base = opts.baseMs ?? 500;
    const max = opts.maxMs ?? 8000;
    const jitter = opts.jitter ?? 0.3;
    const shouldRetry = opts.shouldRetry ?? isRetryable;

    let lastErr: unknown;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (attempt >= retries || !shouldRetry(err)) break;
            const exp = Math.min(max, base * 2 ** (attempt - 1));
            const j = exp * jitter * Math.random();
            const wait = Math.round(exp + j);
            if (opts.label) {
                // eslint-disable-next-line no-console
                console.warn(`[retry] ${opts.label}: attempt ${attempt} failed (${String((err as any)?.message ?? err)}); retrying in ${wait}ms`);
            }
            await new Promise((r) => setTimeout(r, wait));
        }
    }
    throw lastErr;
}
