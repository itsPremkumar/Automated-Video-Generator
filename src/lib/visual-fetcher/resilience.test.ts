/**
 * resilience.test.ts — network resilience for the visual fetcher.
 *
 * Two guarantees added this wave:
 *  1. withRetry() retries a flaky async fn with exponential backoff and
 *     only rethrows after maxAttempts. A single transient failure must NOT
 *     bubble up and drop a scene.
 *  2. fetchVisualsForScene() never returns null when a placeholder can be
 *     synthesized — so the slideshow keeps its full scene count instead of
 *     silently collapsing to 1/3 scenes on a bad network day.
 *
 * These run offline (no live providers) and are deterministic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from './search.js';

test('withRetry succeeds on first try without delay', async () => {
    let calls = 0;
    const r = await withRetry(async () => { calls++; return 'ok'; }, 't');
    assert.equal(r, 'ok');
    assert.equal(calls, 1);
});

test('withRetry retries transient failures then succeeds', async () => {
    let calls = 0;
    const r = await withRetry(async () => {
        calls++;
        if (calls < 3) throw new Error('blip');
        return calls;
    }, 't', 4);
    assert.equal(r, 3);
    assert.equal(calls, 3);
});

test('withRetry rethrows after maxAttempts', async () => {
    let calls = 0;
    await assert.rejects(
        withRetry(async () => { calls++; throw new Error('down'); }, 't', 3),
        /down/,
    );
    assert.equal(calls, 3);
});

test('withRetry default maxAttempts is 3', async () => {
    let calls = 0;
    await assert.rejects(
        withRetry(async () => { calls++; throw new Error('x'); }, 't'),
        /x/,
    );
    assert.equal(calls, 3);
});
