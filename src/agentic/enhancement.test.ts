/**
 * enhancement.test.ts — Phase 9.1 / 4.1 / 7.2 / 8.4 pure-logic coverage.
 * No external AI, no ffmpeg binary needed for the scoring/chunking tests; the
 * post-render test uses the bundled ffprobe via a generated tiny MP4.
 */
import assert from 'node:assert';
import test from 'node:test';
import { scoreCandidate } from './agent.js';
import { AssetCandidate, AssetVerification } from './types.js';
import { buildDuckExpression, chunkCues } from './orchestrate.js';
import { verifyRenderedVideo } from './gate.js';

function mkCandidate(kind: 'image' | 'music', sceneIndex: number, localPath = '/tmp/x_720x1280.jpg'): AssetCandidate {
    return { kind, sceneIndex, candidateIndex: 0, localPath, url: 'https://e/x.jpg', source: 'openverse', license: 'CC-BY', keywords: ['cat', 'sun'] };
}

test('scoreCandidate: higher confidence+resolution beats a tiny thumbnail', () => {
    const good: AssetVerification = { assetId: 'image_s0_c0', kind: 'image', sceneIndex: 0, passes: true, confidence: 9, reason: 'ok' };
    const weak: AssetVerification = { assetId: 'image_s1_c0', kind: 'image', sceneIndex: 1, passes: true, confidence: 5, reason: 'meh' };
    const sGood = scoreCandidate(mkCandidate('image', 0), good);
    const sWeak = scoreCandidate(mkCandidate('image', 1), weak);
    assert.ok(sGood.totalScore > sWeak.totalScore, 'good should outscore weak');
    // confidence contributes 0.5*conf; 9 vs 5 -> +2; rest similar
    assert.ok(Math.abs(sGood.totalScore - sWeak.totalScore) >= 1.9);
});

test('scoreCandidate: fileSizeScore penalises <50KB thumbnails (no file => mid)', () => {
    const v: AssetVerification = { assetId: 'image_s0_c0', kind: 'image', sceneIndex: 0, passes: true, confidence: 7, reason: 'ok' };
    const s = scoreCandidate(mkCandidate('image', 0, '/nonexistent-xyz.png'), v);
    assert.ok(s.totalScore > 0);
    assert.equal(s.confidenceScore, 7);
});

test('buildDuckExpression: null when no captions, else sums between() over speech', () => {
    const none = buildDuckExpression([{ durationSec: 4 }], 0.18, 0.06);
    assert.equal(none, null);
    const withSpeech = buildDuckExpression(
        [{ durationSec: 4, captionSegments: [{ startMs: 0, endMs: 1500 }] }],
        0.18,
        0.06,
    );
    assert.ok(withSpeech!.includes('between(t\\,0.000\\,1.500)'));
    assert.ok(withSpeech!.includes('gt('));
    assert.ok(withSpeech!.startsWith('0.18-0.120*gt('));
});

test('chunkCues: merges sub-100ms micro segments and splits >8-word lines', () => {
    const merged = chunkCues([
        { text: 'a', startMs: 0, endMs: 50 },
        { text: 'b', startMs: 50, endMs: 400 },
    ]);
    // "a" (50ms) merges into "b" -> one cue
    assert.equal(merged.length, 1);
    assert.equal(merged[0].text, 'a b');

    const long = chunkCues([
        { text: 'one two three four five six seven eight nine ten', startMs: 0, endMs: 2000 },
    ]);
    assert.equal(long.length, 2, '>8 words split into two chunks');
    assert.ok(long[0].text.split(' ').length <= 8);
});

test('chunkCues: enforces a minimum 500ms display', () => {
    const out = chunkCues([{ text: 'hi', startMs: 1000, endMs: 1200 }]);
    assert.equal(out[0].endMs - out[0].startMs, 500);
});

test('verifyRenderedVideo: detects a valid tiny MP4 and confirms audio/video', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpeg: string = require('ffmpeg-static');
    const { execFileSync } = require('child_process');
    const fs = require('fs');
    const os = require('os');
    const p = `${os.tmpdir()}/enh_${Date.now()}.mp4`;
    // 4s of real color + sine audio so the file exceeds the 100KB sanity floor.
    execFileSync(ffmpeg, [
        '-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=25:duration=4',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '0', '-c:a', 'aac', '-shortest', '-y', p,
    ], { stdio: 'ignore' });
    assert.ok(fs.statSync(p).size > 100_000, 'sanity: generated mp4 should exceed 100KB');
    const r = verifyRenderedVideo(p, 4);
    // testsrc has black borders, so the new X10 (black-frame) check correctly
    // flags it. Every OTHER check (X7-X9, X11-X15) must pass on a valid clip.
    const failed = r.checks.filter((c) => !c.pass).map((c) => c.id);
    assert.deepEqual(failed, ['X10'], 'unexpected failures: ' + JSON.stringify(r.checks));
    assert.ok(r.probed?.hasVideo);
    assert.ok(r.probed?.hasAudio);
    assert.ok(Math.abs(r.probed!.durationSec - 4) < 0.3);
    fs.rmSync(p, { force: true });
});

test('verifyRenderedVideo: fails when file missing', () => {
    const r = verifyRenderedVideo('/no/such/file.mp4', 5);
    assert.equal(r.pass, false);
    assert.equal(r.checks.find((c) => c.id === 'X7')!.pass, false);
});
