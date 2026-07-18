import assert from 'node:assert';
import { test } from 'node:test';
import { buildDuckExpression, chunkCues, sourceFromUrl } from './orchestrate.js';

// ── sourceFromUrl ────────────────────────────────────────────────────────────
test('sourceFromUrl maps known hosts', () => {
    assert.strictEqual(sourceFromUrl('https://images.pexels.com/x.jpg'), 'pexels');
    assert.strictEqual(sourceFromUrl('https://cdn.pixabay.com/y.png'), 'pixabay');
    assert.strictEqual(sourceFromUrl('https://upload.wikimedia.org/z.jpg'), 'wikimedia');
    assert.strictEqual(sourceFromUrl('https://commons.wikimedia.org/z.jpg'), 'wikimedia');
    assert.strictEqual(sourceFromUrl('https://archive.org/a.mp4'), 'internet-archive');
    assert.strictEqual(sourceFromUrl('https://openverse.tube/b.jpg'), 'openverse');
});

test('sourceFromUrl falls back to hostname / unknown for junk', () => {
    assert.strictEqual(sourceFromUrl('https://example.com/x.jpg'), 'example.com');
    assert.strictEqual(sourceFromUrl('not a url'), 'unknown');
    assert.strictEqual(sourceFromUrl(''), 'unknown');
});

// ── buildDuckExpression ──────────────────────────────────────────────────────
test('buildDuckExpression returns null when no caption segments', () => {
    assert.strictEqual(buildDuckExpression([{ durationSec: 4 }], 0.18, 0.06), null);
    assert.strictEqual(buildDuckExpression([], 0.18, 0.06), null);
});

test('buildDuckExpression builds a summed between()*gt duck term', () => {
    const out = buildDuckExpression([{ durationSec: 4, captionSegments: [{ startMs: 0, endMs: 1000 }] }], 0.18, 0.06);
    assert.ok(out, 'expected a non-null expression');
    // full - (full-duck)*gt(...)
    assert.ok(out!.startsWith('0.18-0.120*gt('), `got: ${out}`);
    assert.ok(out!.includes('between(t\\,0.000\\,1.000)'), `got: ${out}`);
});

test('buildDuckExpression accumulates offsets across multiple scenes', () => {
    const out = buildDuckExpression(
        [
            { durationSec: 4, captionSegments: [{ startMs: 0, endMs: 1000 }] },
            { durationSec: 4, captionSegments: [{ startMs: 500, endMs: 1500 }] },
        ],
        0.18,
        0.06,
    );
    assert.ok(out, 'expected non-null');
    // second scene starts at t=4s, so its cue is at 4.5 .. 5.5
    assert.ok(out!.includes('between(t\\,4.500\\,5.500)'), `got: ${out}`);
});

// ── chunkCues ────────────────────────────────────────────────────────────────
test('chunkCues: merges sub-100ms / <3-char micro-segments into the previous (absorb trailing fragments)', () => {
    const out = chunkCues([
        { text: 'the cat sat', startMs: 0, endMs: 1950 },
        { text: 'a', startMs: 1950, endMs: 2000 }, // tiny trailing fragment
    ]);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].text, 'the cat sat a');
    assert.strictEqual(out[0].startMs, 0);
    assert.strictEqual(out[0].endMs, 2000);
});

test('chunkCues: enforces a minimum 500ms display window', () => {
    const out = chunkCues([{ text: 'hello world', startMs: 1000, endMs: 1200 }]); // 200ms < 500
    assert.strictEqual(out[0].endMs - out[0].startMs, 500);
});

test('chunkCues: splits >8-word segments in half at the midpoint', () => {
    const text = 'one two three four five six seven eight nine ten'; // 10 words
    const out = chunkCues([{ text, startMs: 0, endMs: 4000 }]);
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0].text.split(/\s+/).length, 5);
    assert.strictEqual(out[1].text.split(/\s+/).length, 5);
    assert.strictEqual(out[0].endMs, out[1].startMs); // midpoint continuous
    assert.strictEqual(out[1].endMs, 4000);
});

test('chunkCues: leaves a normal <=8-word cue untouched', () => {
    const inSeg = { text: 'the cat sat still', startMs: 0, endMs: 1500 };
    const out = chunkCues([inSeg]);
    assert.deepStrictEqual(out, [inSeg]);
});

test('chunkCues: empty input returns empty', () => {
    assert.deepStrictEqual(chunkCues([]), []);
});
