/**
 * withSignal.test.ts — regression guard for BUG #5 (music-download hang).
 *
 * Previously withSignal only attached an AbortSignal 'abort' listener. When a
 * streaming axios request (responseType: arraybuffer) never flushes and never
 * fires 'abort', the outer await hung FOREVER (9+ min killed render). The
 * hardened version races a hard timer promise that ALWAYS rejects, so the await
 * can never hang — even if the inner promise never settles.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withSignal } from '../music-system/providers/base.js';

test('rejects after timeout even when the inner promise NEVER settles', async () => {
    const never = new Promise<string>((_resolve) => { /* intentionally never resolves */ });
    await assert.rejects(
        withSignal(() => never, 120, 'hang-test'),
        /timed out after 120ms/,
    );
});

test('resolves with the inner value when it completes in time', async () => {
    const fast = () => Promise.resolve('ok');
    const r = await withSignal(fast, 1000, 'fast-test');
    assert.strictEqual(r, 'ok');
});

test('propagates inner rejection (e.g. abort) promptly', async () => {
    const boom = () => Promise.reject(new Error('aborted by signal'));
    await assert.rejects(withSignal(boom, 2000, 'boom-test'), /aborted by signal/);
});
