/**
 * Regression test for the blackdetect/freezedetect whole-clip FALSE POSITIVE.
 *
 * On this ffmpeg build, at the default `info` loglevel (no `-v error`), the
 * blackdetect filter emits a single black stretch spanning the ENTIRE clip
 * (black_start≈0, black_end≈duration) for videos that are visibly NOT black —
 * the null muxer never closes the detection before EOF. The analyzer must NOT
 * report that as a defect. detectBlackFrames/detectFreezeFrames now (a) run
 * ffmpeg with `-v error` and (b) drop any detection covering >95% of the clip.
 *
 * We assert on a real rendered clip (v1 Spanish/local-pool video) that the
 * functions return zero detections — proving the artifact is filtered, not
 * that the video is genuinely black (frame sampling already confirmed content).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { detectBlackFrames, detectFreezeFrames } from './video-analyzer.js';

const clip = path.resolve(
    'output/v1_es_voice/El Futuro de las Energias Limpias.mp4',
);

test('detectBlackFrames does not false-positive on a real (non-black) clip', async () => {
    if (!fs.existsSync(clip)) {
        // Artifact not present in this environment — skip rather than fail.
        return;
    }
    const black = await detectBlackFrames(clip);
    // A whole-clip "black" is an ffmpeg artifact; the guard must drop it.
    assert.equal(black.length, 0, `expected 0 black frames, got ${JSON.stringify(black)}`);
});

test('detectFreezeFrames does not false-positive on a real clip', async () => {
    if (!fs.existsSync(clip)) return;
    const freeze = await detectFreezeFrames(clip);
    assert.equal(freeze.length, 0, `expected 0 freeze frames, got ${JSON.stringify(freeze)}`);
});
