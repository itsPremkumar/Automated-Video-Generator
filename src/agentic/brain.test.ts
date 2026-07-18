import assert from 'node:assert';
import { test } from 'node:test';
import { AgentBrain } from './brain.js';

// No model configured -> every call returns null (heuristic path), no throw.
test('brain with no model returns null and never throws', async () => {
    const b = new AgentBrain({});
    assert.equal(await b.writeScript('t', 'x'), null);
    assert.equal(await b.expandKeywords('s', 't'), null);
    assert.equal(await b.visionVerify('nope.jpg', ['cat']), null);
    assert.equal(b.modelEnabled, false);
});

// Budget: maxCalls=0 -> tripped immediately, modelEnabled false.
test('brain budget maxCalls=0 trips and disables model', async () => {
    const b = new AgentBrain({ openRouterKey: 'k', maxCalls: 0 });
    assert.equal(b.modelEnabled, false);
    assert.equal(await b.writeScript('t', 'x'), null);
});

// Circuit-breaker: maxFails trips after N consecutive nulls.
test('circuit-breaker trips after maxFails consecutive failures', async () => {
    // openRouterKey set but no network -> completeJSON returns null each call.
    const b = new AgentBrain({ openRouterKey: 'fake-key', maxFails: 2 });
    assert.equal(b.modelEnabled, true);
    await b.writeScript('t', 'x'); // fail 1
    assert.equal(b.isTripped, false);
    await b.expandKeywords('s', 't'); // fail 2 -> trip
    assert.equal(b.isTripped, true);
    assert.equal(b.modelEnabled, false);
    assert.equal(await b.titleVariants('t', ['a']), null); // no network hit
});

// callsRemaining reflects budget.
test('callsRemaining reflects budget', async () => {
    const b = new AgentBrain({ openRouterKey: 'k', maxCalls: 3 });
    assert.equal(b.callsRemaining, 3);
});
