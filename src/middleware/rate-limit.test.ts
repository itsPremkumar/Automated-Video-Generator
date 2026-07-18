/**
 * rate-limit.test.ts — memory rate limiter behavior.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRateLimiter } from './rate-limit.js';
import type { Request, NextFunction } from 'express';

function makeReq(ip: string): Partial<Request> {
    return { ip, socket: { remoteAddress: ip } as any };
}
function makeRes(): any {
    const headers: Record<string, string> = {};
    return {
        setHeader: (k: string, v: string) => (headers[k] = v),
    };
}

describe('createMemoryRateLimiter', () => {
    test('allows up to max, then blocks', () => {
        const limiter = createMemoryRateLimiter({ keyPrefix: 't', max: 3, windowMs: 1000 });
        const ip = '127.0.0.1';
        let passed = 0;
        let errored = 0;
        const next = (err?: unknown) => (err ? errored++ : passed++);
        for (let i = 0; i < 3; i++) limiter(makeReq(ip) as Request, makeRes() as any, next as NextFunction);
        assert.equal(passed, 3);
        assert.equal(errored, 0);
        limiter(makeReq(ip) as Request, makeRes() as any, next as NextFunction);
        assert.equal(errored, 1);
    });

    test('different IPs are tracked independently', () => {
        const limiter = createMemoryRateLimiter({ keyPrefix: 't2', max: 1, windowMs: 1000 });
        let passed = 0;
        const next = () => passed++;
        limiter(makeReq('1.1.1.1') as Request, makeRes() as any, next as NextFunction);
        limiter(makeReq('2.2.2.2') as Request, makeRes() as any, next as NextFunction);
        assert.equal(passed, 2);
    });

    test('resets after window expires', async () => {
        const limiter = createMemoryRateLimiter({ keyPrefix: 't3', max: 1, windowMs: 20 });
        let passed = 0;
        let errored = 0;
        const next = (err?: unknown) => (err ? errored++ : passed++);
        limiter(makeReq('3.3.3.3') as Request, makeRes() as any, next as NextFunction);
        limiter(makeReq('3.3.3.3') as Request, makeRes() as any, next as NextFunction);
        assert.equal(errored, 1);
        await new Promise((r) => setTimeout(r, 40));
        limiter(makeReq('3.3.3.3') as Request, makeRes() as any, next as NextFunction);
        assert.equal(passed, 2);
    });
});
