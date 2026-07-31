import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeLabel, visualStem } from './bulk-fetch.js';

// ─────────────────────────────────────────────────────────────────────────────
// Regression for a REAL bug found 2026-07-31 (compose campaign): per-scene
// visual fetches all wrote to the SAME filename (`image_001.jpeg` in a shared
// raw dir), so later scenes OVERWROTE the file earlier scenes pointed at →
// several scenes rendered the identical photo (verified: scenes 0&3 and
// 1/2/5/6 of a 7-scene video were pixel-identical).
//
// The fix: callers pass a scene-unique `label`; the filename stem derives from
// it. These tests pin the invariant "different label → different stem" and the
// default backward-compat behavior.
// ─────────────────────────────────────────────────────────────────────────────

test('visualStem defaults to the kind when no label is given (backward compat)', () => {
    assert.equal(visualStem('image'), 'image');
    assert.equal(visualStem('video'), 'video');
    assert.equal(visualStem('image', undefined), 'image');
});

test('visualStem uses the sanitized label when provided', () => {
    assert.equal(visualStem('image', 'scene_0_moon'), 'scene_0_moon');
    assert.equal(visualStem('image', 'scene_3_James Webb telescope!'), 'scene_3_James_Webb_telescope');
    assert.equal(visualStem('video', 'scene_1_traffic cam'), 'scene_1_traffic_cam');
});

test('different scene labels produce different stems (no filename collision)', () => {
    const stems = new Set([0, 1, 2, 3, 4, 5, 6].map((i) => visualStem('image', `scene_${i}_kw`)));
    assert.equal(stems.size, 7, 'every scene label must map to a unique stem');
});

test('sanitizeLabel strips path separators and reserved characters', () => {
    assert.equal(sanitizeLabel('a/b\\c:d*e?f"g<h>i|j'), 'a_b_c_d_e_f_g_h_i_j');
    assert.equal(sanitizeLabel('  padded  '), 'padded');
    assert.equal(sanitizeLabel(''), 'media');
    assert.equal(sanitizeLabel('___'), 'media');
});

test('sanitizeLabel caps length at 48 chars', () => {
    const long = 'x'.repeat(200);
    assert.ok(sanitizeLabel(long).length <= 48);
});
