/**
 * Regression: near-uniform placeholder images must be rejected as scene
 * visuals (matrix QA found a solid-color gradient accepted as a real photo
 * and mislabeled "Source: openverse/pexels"). A real photographic image must
 * pass. Uses ffmpeg-static to synthesize both fixtures — no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { checkImageHasContent, isUniformPlaceholderImage } from '../../../src/agentic/pipeline/asset-validators.js';

const ff = ffmpegPath as unknown as string;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-val-'));

function makeGradient(): string {
    const p = path.join(tmp, 'gradient.png');
    execFileSync(ff, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x1e3a8a:s=720x1280', '-frames:v', '1', p], { stdio: 'ignore' });
    return p;
}

function makePhoto(): string {
    // Mandelbrot produces a high-variance (real-content-like) image.
    const p = path.join(tmp, 'photo.png');
    execFileSync(ff, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'mandelbrot=s=720x1280', '-frames:v', '1', '-vf', 'format=yuv420p', p], { stdio: 'ignore' });
    return p;
}

test('rejects a solid-color gradient placeholder', () => {
    const g = makeGradient();
    assert.ok(fs.existsSync(g), 'gradient fixture created');
    const res = checkImageHasContent(g);
    assert.equal(res.ok, false, `gradient should be rejected (got YSTD=${res.stddev})`);
    assert.equal(isUniformPlaceholderImage(g), true);
});

test('accepts a high-variance (real-content) image', () => {
    const p = makePhoto();
    assert.ok(fs.existsSync(p), 'photo fixture created');
    const res = checkImageHasContent(p);
    assert.equal(res.ok, true, `photo should pass (got YSTD=${res.stddev})`);
    assert.equal(isUniformPlaceholderImage(p), false);
});

test('treats a missing file as not-content', () => {
    const res = checkImageHasContent(path.join(tmp, 'nope.png'));
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'missing file');
});

test('validator is permissive on ffmpeg failure (never blocks legit assets)', () => {
    // A .txt is not a valid image; the catch path must return ok:true so the
    // caller's own robustness decides, not this heuristic.
    const bad = path.join(tmp, 'x.txt');
    fs.writeFileSync(bad, 'not an image');
    const res = checkImageHasContent(bad);
    assert.equal(res.ok, true);
});
