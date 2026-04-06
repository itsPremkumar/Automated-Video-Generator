import { RequestHandler } from 'express';
import { TooManyRequestsError } from '../lib/errors';

interface RateLimitOptions {
    keyPrefix: string;
    max: number;
    windowMs: number;
}

interface RateLimitRecord {
    count: number;
    resetAt: number;
}

export function createMemoryRateLimiter(options: RateLimitOptions): RequestHandler {
    const records = new Map<string, RateLimitRecord>();

    return (req, res, next) => {
        const now = Date.now();
        const key = `${options.keyPrefix}:${req.ip || req.socket.remoteAddress || 'unknown'}`;

        for (const [recordKey, record] of records.entries()) {
            if (record.resetAt <= now) {
                records.delete(recordKey);
            }
        }

        const current = records.get(key);
        if (!current || current.resetAt <= now) {
            records.set(key, {
                count: 1,
                resetAt: now + options.windowMs,
            });
            next();
            return;
        }

        if (current.count >= options.max) {
            const retryAfter = Math.ceil((current.resetAt - now) / 1000);
            res.setHeader('Retry-After', String(retryAfter));
            next(new TooManyRequestsError('Too many requests.', { retryAfter }));
            return;
        }

        current.count += 1;
        next();
    };
}
