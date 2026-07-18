import assert from 'node:assert';
import { test } from 'node:test';
import { mapWithConcurrencyLimit } from './acquire.js';

test('mapWithConcurrencyLimit: preserves input order even with varied latency', async () => {
    const tasks = [0, 1, 2, 3, 4].map((n) => async () => {
        // staggered latencies should NOT reorder results
        await new Promise((r) => setTimeout(r, (5 - n) * 5));
        return n * 10;
    });
    const out = await mapWithConcurrencyLimit(tasks, 2);
    assert.deepStrictEqual(out, [0, 10, 20, 30, 40]);
});

test('mapWithConcurrencyLimit: never runs more than `limit` tasks concurrently', async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 12 }, () => async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 15));
        active--;
        return true;
    });
    await mapWithConcurrencyLimit(tasks, 3);
    assert.ok(peak <= 3, `peak concurrency was ${peak}, expected <= 3`);
    assert.strictEqual(peak, 3, 'should actually saturate the limit');
});

test('mapWithConcurrencyLimit: limit >= tasks uses all tasks at once', async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 4 }, () => async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return true;
    });
    await mapWithConcurrencyLimit(tasks, 10);
    assert.strictEqual(peak, 4);
});

test('mapWithConcurrencyLimit: empty input returns empty', async () => {
    assert.deepStrictEqual(await mapWithConcurrencyLimit([], 4), []);
});

test('mapWithConcurrencyLimit: propagates per-task errors (no swallow)', async () => {
    const tasks = [
        async () => 1,
        async () => {
            throw new Error('boom');
        },
        async () => 3,
    ];
    await assert.rejects(() => mapWithConcurrencyLimit(tasks, 2), /boom/);
});
