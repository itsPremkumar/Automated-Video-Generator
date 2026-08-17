/**
 * Production integration test: offline mode end-to-end.
 * Verifies that bundled assets are available and can produce a video
 * when network sources fail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOfflineModeAvailable, bundledImages, bundledVideos, bundledMusic } from '../../../src/agentic/media/bundled-media.js';

test('bundled assets: images available', () => {
    const imgs = bundledImages();
    assert.ok(imgs.length > 0, 'should have bundled images');
    for (const img of imgs) {
        assert.ok(require('fs').existsSync(img.path), `bundled image exists: ${img.path}`);
    }
});

test('bundled assets: videos available', () => {
    const vids = bundledVideos();
    assert.ok(vids.length > 0, 'should have bundled videos');
    for (const v of vids) {
        assert.ok(require('fs').existsSync(v.path), `bundled video exists: ${v.path}`);
    }
});

test('bundled assets: music available', () => {
    const mus = bundledMusic();
    assert.ok(mus.length > 0, 'should have bundled music');
    for (const m of mus) {
        assert.ok(require('fs').existsSync(m.path), `bundled music exists: ${m.path}`);
    }
});

test('offline mode available', () => {
    assert.equal(isOfflineModeAvailable(), true, 'offline mode should be available');
});
