import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kenBurnsFilter, buildKenBurnsFilter } from './visual-fx';

test('kenBurnsFilter defaults to landscape 1280x720 (backward compat)', () => {
    const f = kenBurnsFilter();
    assert.match(f, /s=1280x720/);
    assert.match(f, /fps=25/);
});

test('kenBurnsFilter honors portrait/reel dimensions', () => {
    const f = kenBurnsFilter(1.15, 3, 1080, 1920, 30);
    assert.match(f, /s=1080x1920/, 'portrait size must appear (was hardcoded 1280x720)');
    assert.match(f, /fps=30/);
    // d = round(durationSec * fps) = 3 * 30 = 90
    assert.match(f, /d=90/);
});

test('kenBurnsFilter frame count tracks fps not a hardcoded 25', () => {
    const f = kenBurnsFilter(1.2, 4, 720, 1280, 24);
    assert.match(f, /d=96/); // 4 * 24
    assert.match(f, /s=720x1280/);
});

// ── Input-aware buildKenBurnsFilter (regression: zoompan d explodes videos) ──

test('buildKenBurnsFilter: real VIDEO input gets d=1 (no frame explosion)', () => {
    const f = buildKenBurnsFilter(25, false, 1280, 720);
    assert.match(f, /d=1/, 'multi-frame video must map 1 output frame per input frame');
    assert.match(f, /s=1280x720/);
    assert.match(f, /fps=25/);
});

test('buildKenBurnsFilter: STILL input gets d=sceneFrames (zoom animates)', () => {
    const f = buildKenBurnsFilter(25, true, 720, 1280);
    assert.match(f, /d=75/, 'a 1-frame still must expand to 75 frames (3s at 25fps)');
    assert.match(f, /s=720x1280/);
});

test('buildKenBurnsFilter: zoom ramp spans the clip, capped at 1.15', () => {
    const f = buildKenBurnsFilter(25, true); // still → d=75
    // step = 1.15^(1/75) ≈ 1.00187 — after 75 frames zoom ≈ 1.15
    assert.match(f, /min\(zoom\*1\.00187,1\.15\)/);
    // video variant uses the same gentle ramp
    const g = buildKenBurnsFilter(25, false);
    assert.match(g, /min\(zoom\*1\.00187,1\.15\)/);
    assert.match(g, /d=1/);
});
