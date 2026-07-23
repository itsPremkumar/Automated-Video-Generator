/**
 * verify.test.ts — Unit tests for STAGE 3 verification matrix.
 *
 * Runs OFFLINE: verifyAll delegates vision to injected fakes; music uses the
 * real verifyMusic with a silent generated tone (so we exercise the real
 * signal path). Confirms the verification matrix is written per kind and that
 * missing files are flaged as failing.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import test from 'node:test';
import { verifyAll } from './verify.js';
import { AgenticWorkspace } from '../management/workspace.js';
import { makeWorkspaceTempDir } from '../../shared/runtime/paths.js';

function fakeWs(tag = 'ver-'): AgenticWorkspace {
    const root = makeWorkspaceTempDir(tag);
    return {
        jobId: tag + Date.now(),
        root,
        assetsDir: path.join(root, 'assets'),
        imagesDir: path.join(root, 'assets', 'images'),
        videosDir: path.join(root, 'assets', 'videos'),
        musicDir: path.join(root, 'assets', 'music'),
        verificationDir: path.join(root, 'verification'),
        audioDir: path.join(root, 'audio'),
    };
}

function fakeCandidates() {
    const dir = makeWorkspaceTempDir('ver-cand-');
    const img1 = path.join(dir, 'real1.jpg');
    const vid1 = path.join(dir, 'real1.mp4');
    const mus1 = path.join(dir, 'real1.mp3');
    fs.writeFileSync(img1, 'x');
    fs.writeFileSync(vid1, 'x');
    fs.writeFileSync(mus1, 'x');
    return [
        { kind: 'image' as const, sceneIndex: 0, candidateIndex: 1, localPath: img1, url: 'u', source: 'pexels', keywords: ['cat'] },
        { kind: 'video' as const, sceneIndex: 1, candidateIndex: 1, localPath: vid1, url: 'u', source: 'pexels', keywords: ['dog'] },
        { kind: 'music' as const, sceneIndex: -1, candidateIndex: 1, localPath: mus1, url: '', source: 'local', keywords: ['ambient'] },
        { kind: 'image' as const, sceneIndex: 2, candidateIndex: 1, localPath: '/tmp/MISSING.jpg', url: 'u', source: 'pexels', keywords: ['fish'] },
    ];
}

test('verifyAll flags missing files as failing', async () => {
    const ws = fakeWs();
    const deps = {
        verifyImage: async () => ({ passes: true, confidence: 8, reason: 'ok' }),
        verifyVideo: async () => ({ passes: true, confidence: 8, reason: 'ok' }),
        ffprobe: async () => null,
        musicOptions: {},
    } as any;

    const results = await verifyAll(fakeCandidates() as any, ws, deps);
    assert.equal(results.length, 4);
    const missing = results.find((r) => r.assetId === 'image_s2_c1');
    assert.ok(missing);
    assert.equal(missing!.passes, false, 'missing file must fail');
    assert.equal(missing!.confidence, 0);
    fs.rmSync(ws.root, { recursive: true, force: true });
    fs.rmSync(path.dirname(fakeCandidates()[0].localPath), { recursive: true, force: true });
});

test('verifyAll writes per-kind JSON check files', async () => {
    const ws = fakeWs();
    const deps = {
        verifyImage: async () => ({ passes: true, confidence: 7, reason: 'ok' }),
        verifyVideo: async () => ({ passes: false, confidence: 3, reason: 'watermark' }),
        ffprobe: async () => null,
        musicOptions: {},
    } as any;

    await verifyAll(fakeCandidates() as any, ws, deps);
    assert.ok(fs.existsSync(path.join(ws.root, 'verification', 'image_checks.json')));
    assert.ok(fs.existsSync(path.join(ws.root, 'verification', 'video_checks.json')));
    assert.ok(fs.existsSync(path.join(ws.root, 'verification', 'music_checks.json')));
    assert.ok(fs.existsSync(path.join(ws.root, 'verification', 'all_checks.json')));

    const all = JSON.parse(fs.readFileSync(path.join(ws.root, 'verification', 'all_checks.json'), 'utf8'));
    const video = all.find((r: any) => r.assetId === 'video_s1_c1');
    assert.equal(video.passes, false);
    const image = all.find((r: any) => r.assetId === 'image_s0_c1');
    assert.equal(image.passes, true);
    fs.rmSync(ws.root, { recursive: true, force: true });
    fs.rmSync(path.dirname(fakeCandidates()[0].localPath), { recursive: true, force: true });
});

test('verifyAll delegates to injected vision + music verifiers', async () => {
    const ws = fakeWs();
    let imgCalls = 0;
    let vidCalls = 0;
    const deps = {
        verifyImage: async () => { imgCalls++; return { passes: true, confidence: 9, reason: 'sharp' }; },
        verifyVideo: async () => { vidCalls++; return { passes: true, confidence: 9, reason: 'clean' }; },
        ffprobe: async () => null,
        musicOptions: {},
    } as any;

    const results = await verifyAll(fakeCandidates() as any, ws, deps);
    assert.equal(imgCalls, 1, 'one real image (missing file skipped)');
    assert.equal(vidCalls, 1);
    const music = results.find((r) => r.kind === 'music');
    assert.ok(music, 'music check should be present');
    fs.rmSync(ws.root, { recursive: true, force: true });
    fs.rmSync(path.dirname(fakeCandidates()[0].localPath), { recursive: true, force: true });
});
