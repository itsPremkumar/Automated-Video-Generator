/**
 * retry.test.ts — unit tests for the bounded retry + backoff utility.
 * Pure (no network, no real calls). Simulates transient failures.
 */
import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { withRetry } from '../../../src/agentic/operations/retry.js';

describe('withRetry', () => {
    test('returns immediately on success (no retries)', async () => {
        let calls = 0;
        const r = await withRetry(
            async () => {
                calls++;
                return 'ok';
            },
            { retries: 3 },
        );
        assert.equal(r, 'ok');
        assert.equal(calls, 1);
    });

    test('retries on transient error then succeeds', async () => {
        let calls = 0;
        const r = await withRetry(
            async () => {
                calls++;
                if (calls < 3) throw Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' });
                return 'recovered';
            },
            { retries: 3, baseMs: 1, maxMs: 5 },
        );
        assert.equal(r, 'recovered');
        assert.equal(calls, 3);
    });

    test('respects shouldRetry=false (non-retryable)', async () => {
        let calls = 0;
        await assert.rejects(
            withRetry(
                async () => {
                    calls++;
                    throw new TypeError('bad input');
                },
                { retries: 3, baseMs: 1, shouldRetry: () => false },
            ),
            /bad input/,
        );
        assert.equal(calls, 1); // no retries
    });

    test('gives up after N attempts and rethrows last error', async () => {
        let calls = 0;
        const err = Object.assign(new Error('boom'), { code: 'ETIMEDOUT' });
        await assert.rejects(
            withRetry(
                async () => {
                    calls++;
                    throw err;
                },
                { retries: 4, baseMs: 1, maxMs: 3 },
            ),
            /boom/,
        );
        assert.equal(calls, 4); // 1 initial + 3 retries
    });

    test('default isRetryable treats null/undefined (empty response) as retryable', async () => {
        let calls = 0;
        await assert.rejects(
            withRetry(
                async () => {
                    calls++;
                    throw null;
                },
                { retries: 2, baseMs: 1, maxMs: 2 },
            ),
        );
        assert.equal(calls, 2);
    });
});
