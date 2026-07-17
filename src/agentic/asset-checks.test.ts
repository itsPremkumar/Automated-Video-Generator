/**
 * asset-checks.test.ts — verifies the STAGE-3 source-asset checks
 * (I4/I5/V4/V5/V6 + I7 duplicate detection) using ffmpeg-generated fixtures.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { probeAsset, checkSourceAsset, fileHash, findDuplicates } from './asset-checks.js';

function ffmpeg(): string { return require('ffmpeg-static'); }

describe('asset-checks', () => {
    let dir: string;
    let img: string;
    let vid: string;
    let dup: string;

    test('setup: generate fixtures', () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-'));
        img = path.join(dir, 'img.png');
        vid = path.join(dir, 'vid.mp4');
        dup = path.join(dir, 'img-dup.png');
        execFileSync(ffmpeg(), ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=1920x1080:d=1', '-frames:v', '1', img], { stdio: 'ignore' });
        execFileSync(ffmpeg(), ['-y', '-f', 'lavfi', '-i', 'testsrc=s=480x270:r=25:d=3', '-t', '3', '-c:v', 'libx264', vid], { stdio: 'ignore' });
        fs.copyFileSync(img, dup); // identical -> duplicate
        assert.ok(fs.existsSync(img) && fs.existsSync(vid));
    });

    test('probeAsset reads image dimensions', async () => {
        const p = await probeAsset(img);
        assert.ok(p);
        assert.equal(p!.width, 1920);
        assert.equal(p!.height, 1080);
    });

    test('I4 passes a high-res image, fails a 240p one', async () => {
        const ok = await checkSourceAsset(img, { kind: 'image', minWidth: 480 });
        assert.equal(ok.find((c) => c.id === 'I4')!.pass, true);
        const smallVid = path.join(dir, 'small.mp4');
        execFileSync(ffmpeg(), ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=1', '-frames:v', '1', smallVid], { stdio: 'ignore' });
        const small = await checkSourceAsset(smallVid, { kind: 'video', minWidth: 480 });
        assert.equal(small.find((c) => c.id === 'V5')!.pass, false, '320px width should fail min 480');
    });

    test('I5 aspect match: 1920x1080 vs 16:9 target passes', async () => {
        const r = await checkSourceAsset(img, { kind: 'image', targetAspect: 16 / 9 });
        assert.equal(r.find((c) => c.id === 'I5')!.pass, true);
    });

    test('V4 video duration fit: 3s clip for 2s scene passes', async () => {
        const r = await checkSourceAsset(vid, { kind: 'video', sceneNeedSec: 2 });
        assert.equal(r.find((c) => c.id === 'V4')!.pass, true);
    });

    test('I7 duplicate detection finds the copied file', () => {
        const groups = findDuplicates([img, vid, dup]);
        const hit = groups.find((g) => g.includes(img) && g.includes(dup));
        assert.ok(hit, 'expected img + img-dup to be flagged as duplicates');
    });

    test('fileHash is stable for identical files', () => {
        assert.equal(fileHash(img), fileHash(dup));
    });

    test('cleanup', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ } });
});
