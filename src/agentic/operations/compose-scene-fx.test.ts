import assert from 'node:assert/strict';
import test from 'node:test';
import {
    gradeFilter,
    vignetteFilter,
    resolveSceneDurations,
    probeDurationSec,
    DEFAULT_SCENE_SEC,
} from './compose-scene-fx';
// Cross-path consistency guard: the orchestrator path consumes THIS map.
import { gradeFilter as orchestratorGradeFilter, type GradeKind } from '../ai/style-engine';
import type { ScenePlan } from '../types';

test('gradeFilter maps known grades to real ffmpeg filters', () => {
    assert.match(gradeFilter('warm')!, /eq=/);
    assert.match(gradeFilter('cool')!, /eq=/);
    assert.match(gradeFilter('cinematic')!, /eq=contrast/);
    assert.match(gradeFilter('vivid')!, /saturation/);
    // Wave F: sepia / black-&-white / vintage now real (were no-ops before)
    assert.match(gradeFilter('sepia')!, /sepia=/);
    assert.match(gradeFilter('bw')!, /format=gray/);
    assert.match(gradeFilter('mono')!, /format=gray/);
    assert.match(gradeFilter('vintage')!, /curves=vintage/);
    // unknown + neutral stay no-op
    assert.equal(gradeFilter('bogus'), undefined);
    assert.equal(gradeFilter('neutral'), undefined);
});

test('gradeFilter maps shared GradeKinds via style-engine (wave-A bug #3)', () => {
    // These three were silent no-ops on the compose path until wave A #3 —
    // three differently-graded probe renders came out with identical RGB.
    for (const kind of ['noir', 'sunset', 'cyberpunk'] as const) {
        const composed = gradeFilter(kind);
        assert.ok(composed, `${kind} must map to a real filter, not undefined`);
        assert.doesNotMatch(composed, /colorbalance/); // YUV-native only on CPU build
        assert.equal(
            composed,
            orchestratorGradeFilter(kind as GradeKind),
            `${kind} must be byte-identical with the orchestrator/render path`,
        );
    }
});

test('gradeFilter returns undefined for neutral and unknown (no-op)', () => {
    assert.equal(gradeFilter('neutral'), undefined);
    assert.equal(gradeFilter('bogus'), undefined);
    assert.equal(gradeFilter(undefined), undefined);
});

test('vignetteFilter is a real vignette filter string', () => {
    assert.match(vignetteFilter(), /vignette/);
});

test('probeDurationSec falls back gracefully for missing files', () => {
    assert.equal(probeDurationSec(undefined), DEFAULT_SCENE_SEC);
    assert.equal(probeDurationSec('/no/such/file.wav', 7), 7);
});

test('resolveSceneDurations falls back to plan durationSec then default', () => {
    const scenes = [
        { durationSec: 4 } as ScenePlan,
        { durationSec: 0 } as ScenePlan,
        {} as ScenePlan,
    ];
    // No real audio files → each falls to plan duration, then default.
    const out = resolveSceneDurations(['', '', ''], scenes);
    assert.equal(out[0], 4);
    assert.equal(out[1], DEFAULT_SCENE_SEC);
    assert.equal(out[2], DEFAULT_SCENE_SEC);
});

test('resolveSceneDurations without a plan uses the default', () => {
    const out = resolveSceneDurations(['', '']);
    assert.deepEqual(out, [DEFAULT_SCENE_SEC, DEFAULT_SCENE_SEC]);
});
