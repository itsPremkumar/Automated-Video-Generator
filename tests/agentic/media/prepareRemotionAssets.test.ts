/**
 * prepareRemotionAssets.test.ts — proves A10 render robustness:
 * a missing/broken image|video asset is replaced with a branded placeholder
 * PNG (so the Remotion render never 404s and aborts), while a present asset is
 * copied normally and a missing MUSIC asset is silently dropped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ffmpegPath from 'ffmpeg-static';

// Real ffmpeg runner (same shape as orchestrate's runFfmpeg) so the placeholder
// is actually generated via ffmpeg-static — proving the real code path works.
const runFfmpeg = (args: string[]): Promise<number> =>
    new Promise((resolve) => {
        const { execFile } = require('child_process');
        execFile(ffmpegPath as string, args, { stdio: 'ignore' }, (err: Error | null) =>
            resolve(err ? 1 : 0),
        );
    });

const makeRes = (assets: any[]) => ({
    plan: {
        title: 'T',
        orientation: 'portrait',
        scenes: assets.map((a, i) => ({ sceneNumber: i, voiceoverText: 'x', durationSec: 3 })),
    },
    workspace: { jobId: 'test-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) },
    manifest: { assets },
}) as any;

const makeAsset = (over: any) => ({
    kind: 'image',
    sceneIndex: 0,
    localPath: '/nonexistent/missing.png',
    durationSec: 3,
    captionSegments: [],
    ...over,
});

test('A10: missing image asset -> branded placeholder PNG is created and kept', async () => {
    const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-remotion-'));
    try {
        const res = makeRes([makeAsset({ localPath: '/no/such/image.png' })]);
        const out = await import('../../../src/agentic/orchestrate.js').then((m) =>
                m.prepareRemotionAssets(res, { brand: { accentColor: '#FF6B35' } }, jobDir, runFfmpeg),
        );
        assert.equal(out.length, 1, 'asset should be kept (placeholder), not dropped');
        const localPath = out[0].localPath as string;
        const file = path.join(jobDir, path.basename(localPath));
        assert.ok(fs.existsSync(file), 'placeholder PNG must exist on disk: ' + file);
        const buf = fs.readFileSync(file);
        assert.ok(buf.length > 0, 'placeholder must be a non-empty file');
        // PNG magic bytes
        assert.deepEqual([buf[0], buf[1], buf[2], buf[3], buf[4], buf[5], buf[6], buf[7]], [
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ], 'placeholder must be a valid PNG');
    } finally {
        fs.rmSync(jobDir, { recursive: true, force: true });
    }
});

test('A10: present image asset -> copied as-is (no placeholder)', async () => {
    const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-remotion-'));
    const src = path.join(jobDir, 'real.png');
    fs.writeFileSync(src, Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
        'base64',
    ));
    try {
        const res = makeRes([makeAsset({ localPath: src })]);
        const out = await import('../../../src/agentic/orchestrate.js').then((m) =>
            m.prepareRemotionAssets(res, {}, jobDir, runFfmpeg),
        );
        assert.equal(out.length, 1, 'present asset kept');
        const file = path.join(jobDir, path.basename(out[0].localPath));
        assert.ok(fs.existsSync(file), 'copied file exists');
        // it is the real source bytes, not a 720x1280 ffmpeg placeholder
        assert.equal(fs.readFileSync(file).length, fs.readFileSync(src).length, 'copied verbatim');
    } finally {
        fs.rmSync(jobDir, { recursive: true, force: true });
    }
});

test('A10: missing MUSIC asset -> dropped silently (no placeholder, no crash)', async () => {
    const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-remotion-'));
    try {
        const res = makeRes([makeAsset({ kind: 'music', localPath: '/no/music.mp3' })]);
        const out = await import('../../../src/agentic/orchestrate.js').then((m) =>
            m.prepareRemotionAssets(res, {}, jobDir, runFfmpeg),
        );
        assert.equal(out.length, 0, 'missing music asset is dropped, not crashed');
    } finally {
        fs.rmSync(jobDir, { recursive: true, force: true });
    }
});
