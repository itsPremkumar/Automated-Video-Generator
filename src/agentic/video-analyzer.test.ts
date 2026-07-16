/**
 * video-analyzer.test.ts — verifies the final-output quality analyzers using
 * ffmpeg-generated clips (no network, deterministic).
 *
 * We use `testsrc` (proven to render on this box) as the "real-ish" clip. It is
 * a moving test pattern with BLACK borders, so the analyzers should report:
 *   - black frames DETECTED (correct — testsrc has black borders)  -> X10 finds them
 *   - no freeze (the pattern animates)                             -> X11 clean
 *   - audio measured, not clipping                                -> X12/X13 clean
 *   - correct dimensions + h264 codec                             -> X14/X15 clean
 * This proves each analyzer reads ffmpeg/ffprobe correctly. A separate black
 * clip proves X10 fires on a genuinely black video.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectBlackFrames, detectFreezeFrames, analyzeAudio, analyzeDimensions } from './video-analyzer.js';
import { verifyRenderedVideo } from './gate.js';

function ffmpeg(): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('ffmpeg-static');
}
function makeTestsrc(): string {
    const p = path.join(os.tmpdir(), `va-ts-${Date.now()}.mp4`);
    execFileSync(ffmpeg(), [
        '-y', '-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=25:duration=4',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
        '-c:v', 'libx264', '-c:a', 'aac', '-shortest', p,
    ], { stdio: 'ignore' });
    return p;
}
function makeBlack(): string {
    const p = path.join(os.tmpdir(), `va-blk-${Date.now()}.mp4`);
    execFileSync(ffmpeg(), ['-y', '-f', 'lavfi', '-i', 'color=c=black:size=720x1280:rate=25:duration=2', '-t', '2', '-c:v', 'libx264', p], { stdio: 'ignore' });
    return p;
}

describe('video-analyzer on a moving test pattern (testsrc)', () => {
    let clip: string;
    test('setup: generate clip', () => { clip = makeTestsrc(); assert.ok(fs.existsSync(clip)); });
    test('black detector FINDS testsrc black borders (X10 works)', () => {
        const b = detectBlackFrames(clip);
        assert.ok(b.length > 0, 'testsrc has black borders -> blackdetect should fire');
    });
    test('no freeze frames on animated pattern (X11)', () => {
        const f = detectFreezeFrames(clip);
        assert.equal(f.length, 0);
    });
    test('audio measured, not clipping (X12/X13)', () => {
        const a = analyzeAudio(clip);
        assert.ok(a.peakDb > -60 && a.peakDb <= 0, `peak ${a.peakDb}`);
        assert.equal(a.clipping, false);
    });
    test('dimensions + codec (X14/X15)', () => {
        const d = analyzeDimensions(clip);
        assert.equal(d.width, 720);
        assert.equal(d.height, 1280);
        assert.equal(d.codec, 'h264');
    });
    test('verifyRenderedVideo: non-black checks all pass; X7/X10 flag synthetic-clip traits only', () => {
        const r = verifyRenderedVideo(clip, 4);
        const failed = r.checks.filter((c) => !c.pass).map((c) => c.id);
        // testsrc is a synthetic pattern: tiny file (X7) + black borders (X10).
        // Both are CORRECT detections; real agentic videos won't hit these.
        assert.deepEqual(failed, ['X7', 'X10'], 'unexpected failures: ' + JSON.stringify(failed));
    });
    test('cleanup', () => { try { fs.rmSync(clip); } catch { /* */ } });
});

describe('video-analyzer detects a fully-black clip', () => {
    test('blackdetect fires (X10)', () => {
        const p = makeBlack();
        const b = detectBlackFrames(p);
        assert.ok(b.length > 0, 'expected black frames on a black clip');
        fs.rmSync(p, { force: true });
    });
});
