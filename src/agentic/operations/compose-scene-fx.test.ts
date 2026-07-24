import assert from 'node:assert/strict';
import test from 'node:test';
import {
    gradeFilter,
    vignetteFilter,
    resolveSceneDurations,
    probeDurationSec,
    DEFAULT_SCENE_SEC,
} from './compose-scene-fx';
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
