import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPublishManifest } from './publish.js';

// ─────────────────────────────────────────────────────────────────────────────
// Feature batch 2026-08-11: publish manifest now also writes TikTok + Instagram
// upload helper scripts (zero-cost drafts), not just YouTube.
// ─────────────────────────────────────────────────────────────────────────────

function fixtureDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-publish-test-'));
    // A fake 16:9 mp4 so pickFileForAspect finds something.
    fs.writeFileSync(path.join(dir, 'job1_16x9.mp4'), 'fake-mp4-bytes');
    return dir;
}

test('publish manifest: writes TikTok + Instagram helper scripts alongside YouTube', () => {
    const dir = fixtureDir();
    try {
        const cfg = { topic: 'test-topic' } as never;
        const manifest = buildPublishManifest({
            jobId: 'job1',
            deliverablesDir: dir,
            cfg,
            title: 'My Video',
            description: 'A test video',
            hashtags: '#ai #video',
        });
        // TikTok script file exists and references the right token var.
        const tiktokScript = path.join(dir, 'job1_tiktok_upload.sh');
        assert.ok(fs.existsSync(tiktokScript), 'tiktok upload script written');
        const tiktokBody = fs.readFileSync(tiktokScript, 'utf8');
        assert.ok(tiktokBody.includes('TIKTOK_ACCESS_TOKEN'), 'tiktok script has token guard');
        assert.ok(tiktokBody.includes('tiktokapis.com'), 'tiktok script has API endpoint');

        // Instagram script file exists.
        const instaScript = path.join(dir, 'job1_instagram_upload.sh');
        assert.ok(fs.existsSync(instaScript), 'instagram upload script written');
        const instaBody = fs.readFileSync(instaScript, 'utf8');
        assert.ok(instaBody.includes('INSTAGRAM_ACCESS_TOKEN'), 'instagram script has token guard');
        assert.ok(instaBody.includes('graph.instagram.com'), 'instagram script has API endpoint');

        // YouTube script still written (regression guard).
        const ytScript = path.join(dir, 'job1_youtube_upload.sh');
        assert.ok(fs.existsSync(ytScript), 'youtube upload script still written');
        const ytBody = fs.readFileSync(ytScript, 'utf8');
        assert.ok(ytBody.includes('YOUTUBE_ACCESS_TOKEN'), 'youtube script has token guard');

        // Manifest lists all platforms with the draft youtube entry.
        assert.equal(manifest.targets.length, 5);
        assert.ok(manifest.youtube?.draft === true);
        assert.ok(manifest.targets.some((t) => t.platform === 'tiktok'));
        assert.ok(manifest.targets.some((t) => t.platform === 'instagram'));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
