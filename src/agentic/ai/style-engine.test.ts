import assert from 'node:assert/strict';
import test from 'node:test';
import { computeStylePlan } from './style-engine';

const basePlan = {
    title: 'Test Video',
    scenes: [
        { sceneNumber: 1, voiceoverText: 'Scene one hook.', durationSec: 5, kineticText: false },
        { sceneNumber: 2, voiceoverText: 'Scene two hook.', durationSec: 5 },
        {
            sceneNumber: 3,
            voiceoverText: 'Scene three hook.',
            durationSec: 5,
            captionTheme: 'neon',
            sfx: false,
            jCutSec: 0.7,
            vignette: false,
            kineticText: true,
            musicIntensity: 'energetic' as const,
        },
    ],
};

test('computeStylePlan passes per-scene overrides through to SceneStyle', () => {
    const sp = computeStylePlan(basePlan, { preset: 'cinematic', kinetic: true });
    assert.equal(sp.scenes.length, 3);

    // Scene 0: kineticText:false must suppress kinetic cues.
    assert.equal(sp.scenes[0].kineticText, false);
    assert.equal(sp.scenes[0].kinetic.length, 0);

    // Scene 2: all 6 overrides carried.
    const s2 = sp.scenes[2];
    assert.equal(s2.captionTheme, 'neon');
    assert.equal(s2.sfx, false);
    assert.equal(s2.jCutSec, 0.7);
    assert.equal(s2.vignette, false);
    assert.equal(s2.kineticText, true);
    assert.equal(s2.musicIntensity, 'energetic');
});

test('computeStylePlan keeps per-scene kinetic when enabled', () => {
    const sp = computeStylePlan(basePlan, { preset: 'cinematic', kinetic: true });
    // Scene 1 has no kineticText override -> defaults to enabled (preset kinetic true).
    assert.ok(sp.scenes[1].kinetic.length > 0);
});

test('computeStylePlan respects global kinetic=false over per-scene true', () => {
    const sp = computeStylePlan(basePlan, { preset: 'cinematic', kinetic: false });
    // When preset disables kinetic globally, scene 2's kineticText:true still yields no cues.
    assert.equal(sp.scenes[2].kinetic.length, 0);
});
