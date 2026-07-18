/**
 * plan.test.ts — pure, offline tests for applyProEdits (pro-editor transforms).
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { applyProEdits, buildPlan } from './plan.js';
import type { Plan } from './types.js';

function fakePlan(texts: string[]): Plan {
    return {
        jobId: 'j',
        title: 'T',
        voice: 'en-US-JennyNeural',
        musicQuery: 'ambient lofi chill',
        orientation: 'portrait',
        scenes: texts.map((t, i) => ({
            sceneNumber: i + 1,
            voiceoverText: t,
            searchKeywords: [],
            visualPreference: 'video',
            durationSec: 4,
        })),
        totalDurationSec: texts.length * 4,
    };
}

describe('applyProEdits', () => {
    test('hookFirst moves a hook-pattern scene to position 0', async () => {
        const p = fakePlan(['first plain fact', 'did you know the secret trick?', 'third plain']);
        await applyProEdits(p, { hookFirst: true });
        assert.equal(p.scenes[0].voiceoverText, 'did you know the secret trick?');
        assert.equal(p.scenes[0].sceneNumber, 1);
    });

    test('hookFirst with no hook pattern keeps longest scene first', async () => {
        const p = fakePlan(['short', 'this is a much longer sentence with more words', 'mid']);
        await applyProEdits(p, { hookFirst: true });
        assert.equal(p.scenes[0].voiceoverText, 'this is a much longer sentence with more words');
    });

    test('variablePacing sets first=3, last=5, alternates middle', async () => {
        const p = fakePlan(['a', 'b', 'c', 'd', 'e']);
        await applyProEdits(p, { variablePacing: true });
        assert.equal(p.scenes[0].durationSec, 3);
        assert.equal(p.scenes[4].durationSec, 5);
        // middle alternates 5/3/5 (i=1 -> +1=5, i=2 -> -1=3, i=3 -> +1=5)
        assert.equal(p.scenes[1].durationSec, 5);
        assert.equal(p.scenes[2].durationSec, 3);
        assert.equal(p.scenes[3].durationSec, 5);
    });

    test('variablePacing never goes below 2', async () => {
        const p = fakePlan(['a', 'b']);
        await applyProEdits(p, { variablePacing: true });
        assert.ok(p.scenes.every((s) => (s.durationSec ?? 0) >= 2));
    });

    test('no-op when both flags false', async () => {
        const p = fakePlan(['a', 'did you know secret', 'c']);
        const before = p.scenes.map((s) => s.voiceoverText).join('|');
        await applyProEdits(p, {});
        assert.equal(p.scenes.map((s) => s.voiceoverText).join('|'), before);
    });

    test('empty plan is safe', async () => {
        const p: Plan = {
            jobId: 'j',
            title: 'T',
            voice: 'en-US-JennyNeural',
            musicQuery: 'ambient lofi chill',
            orientation: 'portrait',
            scenes: [],
            totalDurationSec: 0,
        };
        await applyProEdits(p, { hookFirst: true, variablePacing: true });
        assert.ok(true);
    });
});
