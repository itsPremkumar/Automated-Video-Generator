/**
 * Regression test for blackdetect: a genuinely-black clip must be DETECTED.
 *
 * The v1 Spanish/local-pool video rendered as a fully-black clip (23.1s black
 * in a 23.17s video). detectBlackFrames must report it. Earlier code had an
 * over-aggressive guard clause that dropped any detection covering >95% of the
 * clip — that guard filtered TRUE POSITIVES (this exact clip) and has been
 * removed. False-positive prevention is covered by the testsrc suite above
 * (testsrc at `-v info` produces zero false positives).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { detectBlackFrames, detectFreezeFrames } from './video-analyzer.js';

const clip = path.resolve(
    'output/v1_es_voice/El Futuro de las Energias Limpias.mp4',
);

test('detectBlackFrames DETECTS a genuinely-black clip (no over-guarding)', async () => {
    if (!fs.existsSync(clip)) {
        // Artifact not present in this environment — skip rather than fail.
        return;
    }
    const black = await detectBlackFrames(clip);
    // The clip IS black — the function MUST report it.
    assert.ok(black.length > 0, `expected black frames on a genuinely black clip, got ${JSON.stringify(black)}`);
    // And the detection should span essentially the whole clip.
    const longest = black.reduce((m, b) => Math.max(m, b.duration), 0);
    assert.ok(longest > 20, `expected long black stretch, got ${longest}s`);
});

test('detectFreezeFrames does not false-positive on a real clip', async () => {
    if (!fs.existsSync(clip)) return;
    const freeze = await detectFreezeFrames(clip);
    assert.equal(freeze.length, 0, `expected 0 freeze frames, got ${JSON.stringify(freeze)}`);
});
