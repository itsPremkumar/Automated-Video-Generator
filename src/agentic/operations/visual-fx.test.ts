import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kenBurnsFilter } from './visual-fx';

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
