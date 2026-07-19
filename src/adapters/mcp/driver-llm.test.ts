import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setDriverLlm, getDriverLlm, hasDriverLlm } from './driver-llm.js';
import type { DriverLlmCallback } from '../../agentic/bridge.js';

test('driver-llm registry: empty by default', () => {
    setDriverLlm(undefined);
    assert.equal(hasDriverLlm(), false);
    assert.equal(getDriverLlm(), undefined);
});

test('driver-llm registry: set + get + has', async () => {
    const cb: DriverLlmCallback = async () => ({ ok: true });
    setDriverLlm(cb);
    assert.equal(hasDriverLlm(), true);
    assert.equal(getDriverLlm(), cb);
    const r = await getDriverLlm()!({ type: 'json', system: 's', prompt: 'p', schemaHint: 'h' });
    assert.deepEqual(r, { ok: true });
});

test('driver-llm registry: replace + clear', () => {
    setDriverLlm(async () => 1);
    assert.equal(hasDriverLlm(), true);
    setDriverLlm(async () => 2);
    assert.equal(hasDriverLlm(), true);
    setDriverLlm(undefined);
    assert.equal(hasDriverLlm(), false);
});
