/**
 * ai-verify.test.ts — verify the opt-in AI verification layer.
 * All tests use a MOCK brain (no network, no key). Confirms the contract:
 *  - disabled / no-model -> returns null (signal gates decide, never blocks)
 *  - enabled + vision pass -> asset accepted
 *  - enabled + vision fail (< minConfidence) -> asset rejected
 *  - audio + transcript -> judged by text model; no transcript -> null
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiVerifyAsset } from '../../../src/agentic/ai/ai-verify.js';
import { AgentBrain } from '../../../src/agentic/ai/brain.js';
import { resolveConfig } from '../../../src/agentic/config.js';
import type { AgenticConfig } from '../../../src/agentic/config.js';

function cfg(over: Partial<NonNullable<AgenticConfig['aiVerify']>> = {}): AgenticConfig {
    // Run through resolveConfig so all sub-flags default correctly (matches prod).
    return resolveConfig({ topic: 't', aiVerify: { enabled: true, ...over } });
}

// Mock brain: visionVerify + completeJSON return canned values.
class MockBrain extends AgentBrain {
    visionResult: any = null;
    textResult: any = null;
    visionCalled = 0;
    textCalled = 0;
    get modelEnabled() {
        return true;
    }
    async visionVerify() {
        this.visionCalled++;
        return this.visionResult;
    }
    async completeJSON(_s: string, _p: string, _h: string) {
        this.textCalled++;
        return this.textResult;
    }
}

test('disabled aiVerify returns null (signal gates decide)', async () => {
    const brain = new MockBrain();
    const r = await aiVerifyAsset('/x.jpg', 'image', ['lion'], { topic: 't' } as AgenticConfig, brain);
    assert.equal(r, null);
    assert.equal(brain.visionCalled, 0);
});

test('no model running -> null even when enabled', async () => {
    const brain = new MockBrain();
    Object.defineProperty(brain, 'modelEnabled', { get: () => false });
    const r = await aiVerifyAsset('/x.jpg', 'image', ['lion'], cfg(), brain);
    assert.equal(r, null);
});

test('vision pass (>= minConfidence) -> accepted', async () => {
    const brain = new MockBrain();
    brain.visionResult = { passes: true, confidence: 9, reason: 'shows a lion' };
    const r = await aiVerifyAsset('/x.jpg', 'image', ['lion'], cfg({ minConfidence: 6 }), brain);
    assert.equal(r?.pass, true);
    assert.equal(r?.confidence, 9);
});

test('vision fail / low confidence -> rejected', async () => {
    const brain = new MockBrain();
    brain.visionResult = { passes: false, confidence: 2, reason: 'shows a forest, not a lion' };
    const r = await aiVerifyAsset('/x.jpg', 'image', ['lion'], cfg({ minConfidence: 6 }), brain);
    assert.equal(r?.pass, false);
    assert.match(r?.reason || '', /forest|subject/);
});

test('enabled -> vision is always called (stage flags enforced by callers)', async () => {
    const brain = new MockBrain();
    brain.visionResult = { passes: false, confidence: 1, reason: 'wrong' };
    // verifyOnAcquire=false still calls vision here; the acquire caller gates it.
    const r = await aiVerifyAsset('/x.jpg', 'image', ['lion'], cfg({ verifyOnAcquire: false }), brain);
    assert.equal(brain.visionCalled, 1); // the function itself always tries when enabled
    assert.equal(r?.pass, false);
});

test('audio with transcript -> judged by text model', async () => {
    const brain = new MockBrain();
    brain.textResult = { confidence: 8, pass: true, reason: 'clear narration' };
    const r = await aiVerifyAsset(
        '/a.mp3',
        'audio',
        ['lion facts'],
        cfg({ checkSpeechClarity: true }),
        brain,
        'A lion is a big cat.',
    );
    assert.equal(r?.pass, true);
    assert.equal(brain.textCalled, 1);
});

test('audio with NO transcript -> null (signal gates decide)', async () => {
    const brain = new MockBrain();
    const r = await aiVerifyAsset('/a.mp3', 'audio', ['lion facts'], cfg({ checkSpeechClarity: true }), brain);
    assert.equal(r, null);
    assert.equal(brain.textCalled, 0);
});

test('verifyOnRender path: video frame scored by vision', async () => {
    const brain = new MockBrain();
    brain.visionResult = { passes: true, confidence: 7, reason: 'on-topic' };
    const r = await aiVerifyAsset('/frame.jpg', 'video', ['lion'], cfg({ verifyOnRender: true }), brain);
    assert.equal(r?.pass, true);
});
