import { logger } from './logger';

interface RetryOptions {
    retries: number;
    baseDelayMs: number;
    label?: string;
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions,
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= options.retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < options.retries) {
                const delay = options.baseDelayMs * Math.pow(2, attempt);
                const label = options.label ? `[${options.label}] ` : '';
                logger.debug(`${label}Attempt ${attempt + 1}/${options.retries + 1} failed, retrying in ${delay}ms...`);
                await sleep(delay);
            }
        }
    }

    throw lastError;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
