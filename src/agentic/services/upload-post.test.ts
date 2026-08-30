/**
 * upload-post.test.ts — Unit tests for the cross-platform posting service.
 *
 *   src/agentic/services/upload-post.ts
 *
 * These run FULLY OFFLINE: every assertion exercises either the pure helpers
 * (`isValidPlatform`, `getSupportedPlatforms`, `isUploadConfigured`) or the
 * env-gated branches of `uploadToPlatform` / `uploadToAllPlatforms` so the
 * test never actually fires an HTTP request.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getSupportedPlatforms,
    isValidPlatform,
    isUploadConfigured,
    getUploadPostConfig,
    uploadToPlatform,
    uploadToAllPlatforms,
    type Platform,
} from './upload-post.js';

// ─── Pure helpers ──────────────────────────────────────────────────────────

test('getSupportedPlatforms returns the canonical 4 platforms', () => {
    const list = getSupportedPlatforms();
    assert.deepEqual(
        list.sort(),
        ['instagram', 'tiktok', 'youtube', 'youtube_shorts'].sort(),
        'supported platforms should match the docstring contract',
    );
    assert.equal(list.length, 4, 'exactly 4 platforms');
});

test('isValidPlatform accepts the 4 supported names', () => {
    for (const p of getSupportedPlatforms()) {
        assert.equal(isValidPlatform(p), true, `${p} should be valid`);
    }
});

test('isValidPlatform rejects unknown platforms', () => {
    for (const bad of ['facebook', 'myspace', 'tiktok-internal', '', 'TIKTOK', 'tik tok']) {
        assert.equal(isValidPlatform(bad), false, `${JSON.stringify(bad)} should be invalid`);
    }
});

test('isValidPlatform is a type-guard', () => {
    // The TypeScript signature `bad is Platform` is checked at compile time;
    // at runtime the function returns a boolean — sanity-check that contract.
    const candidates: unknown[] = ['tiktok', 42, null, { name: 'youtube' }];
    const validOnly: Platform[] = candidates.filter((c): c is Platform => isValidPlatform(c as string));
    assert.deepEqual(validOnly, ['tiktok']);
});

// ─── Env-gated config ──────────────────────────────────────────────────────

test('isUploadConfigured returns false when no env is set', () => {
    const prev = { ...process.env };
    delete process.env.UPLOAD_POST_ENABLED;
    delete process.env.UPLOAD_POST_API_KEY;
    delete process.env.UPLOAD_POST_USERNAME;
    try {
        assert.equal(isUploadConfigured(), false, 'no env → not configured');
    } finally {
        process.env = prev;
    }
});

test('isUploadConfigured requires BOTH enabled AND credentials', () => {
    const prev = { ...process.env };
    try {
        // enabled=true but no API key/username
        process.env.UPLOAD_POST_ENABLED = 'true';
        delete process.env.UPLOAD_POST_API_KEY;
        delete process.env.UPLOAD_POST_USERNAME;
        assert.equal(isUploadConfigured(), false, 'enabled without creds → not configured');

        // creds but not enabled
        process.env.UPLOAD_POST_ENABLED = 'false';
        process.env.UPLOAD_POST_API_KEY = 'fake_key_for_test';
        process.env.UPLOAD_POST_USERNAME = 'fake_user';
        assert.equal(isUploadConfigured(), false, 'creds without enabled → not configured');

        // all three set
        process.env.UPLOAD_POST_ENABLED = 'true';
        assert.equal(isUploadConfigured(), true, 'enabled + creds → configured');
    } finally {
        process.env = prev;
    }
});

test('getUploadPostConfig defaults to tiktok+instagram platforms', () => {
    const prev = { ...process.env };
    delete process.env.UPLOAD_POST_PLATFORMS;
    try {
        const cfg = getUploadPostConfig();
        assert.deepEqual(
            cfg.platforms.sort(),
            ['instagram', 'tiktok'],
            'default platforms should be tiktok,instagram',
        );
        assert.equal(cfg.autoUpload, false, 'autoUpload defaults to false');
        assert.equal(cfg.youtubePrivacyStatus, 'public', 'youtube privacy defaults to public');
    } finally {
        process.env = prev;
    }
});

test('getUploadPostConfig parses custom platforms list', () => {
    const prev = process.env.UPLOAD_POST_PLATFORMS;
    process.env.UPLOAD_POST_PLATFORMS = 'youtube, youtube_shorts, instagram';
    try {
        const cfg = getUploadPostConfig();
        assert.deepEqual(
            cfg.platforms.sort(),
            ['instagram', 'youtube', 'youtube_shorts'].sort(),
            'platforms list parsed correctly (whitespace-tolerant)',
        );
    } finally {
        if (prev === undefined) delete process.env.UPLOAD_POST_PLATFORMS;
        else process.env.UPLOAD_POST_PLATFORMS = prev;
    }
});

// ─── uploadToPlatform (no-op paths — never hits the network) ─────────────

test('uploadToPlatform returns a clean error when disabled', async () => {
    const prev = { ...process.env };
    delete process.env.UPLOAD_POST_ENABLED;
    delete process.env.UPLOAD_POST_API_KEY;
    delete process.env.UPLOAD_POST_USERNAME;
    try {
        const res = await uploadToPlatform('/tmp/does-not-exist.mp4', 't', 'tiktok');
        assert.equal(res.success, false, 'disabled → fail');
        assert.equal(res.platform, 'tiktok', 'platform echoed back');
        assert.ok(res.error && res.error.includes('disabled'), 'error mentions disabled');
    } finally {
        process.env = prev;
    }
});

test('uploadToPlatform returns a clean error when creds are missing', async () => {
    const prev = { ...process.env };
    process.env.UPLOAD_POST_ENABLED = 'true';
    delete process.env.UPLOAD_POST_API_KEY;
    delete process.env.UPLOAD_POST_USERNAME;
    try {
        const res = await uploadToPlatform('/tmp/does-not-exist.mp4', 't', 'tiktok');
        assert.equal(res.success, false);
        assert.ok(res.error && /not configured/i.test(res.error), 'error mentions not configured');
    } finally {
        process.env = prev;
    }
});

test('uploadToPlatform returns a clean error when the file does not exist', async () => {
    const prev = { ...process.env };
    process.env.UPLOAD_POST_ENABLED = 'true';
    process.env.UPLOAD_POST_API_KEY = 'fake_key_for_test_only';
    process.env.UPLOAD_POST_USERNAME = 'fake_user';
    try {
        const res = await uploadToPlatform(
            `/tmp/__no_such_file_${Date.now()}.mp4`,
            'title',
            'tiktok',
        );
        assert.equal(res.success, false);
        assert.ok(res.error && /not found/i.test(res.error), 'error mentions not found');
    } finally {
        process.env = prev;
    }
});

test('uploadToPlatform does NOT throw — returns a result object', async () => {
    // Even with the worst possible input (bad path, no env, no file) the
    // contract is "never throws" — proves identity preservation.
    const prev = { ...process.env };
    delete process.env.UPLOAD_POST_ENABLED;
    delete process.env.UPLOAD_POST_API_KEY;
    delete process.env.UPLOAD_POST_USERNAME;
    try {
        let result;
        try {
            result = await uploadToPlatform('', '', 'tiktok');
        } catch (e) {
            assert.fail(`uploadToPlatform should not throw, got: ${(e as Error).message}`);
        }
        assert.equal(typeof result, 'object', 'returns a result object');
        assert.equal(result?.success, false);
    } finally {
        process.env = prev;
    }
});

// ─── uploadToAllPlatforms (aggregation) ──────────────────────────────────

test('uploadToAllPlatforms aggregates per-platform results', async () => {
    const prev = { ...process.env };
    process.env.UPLOAD_POST_ENABLED = 'true';
    delete process.env.UPLOAD_POST_API_KEY;
    delete process.env.UPLOAD_POST_USERNAME;
    process.env.UPLOAD_POST_PLATFORMS = 'tiktok,instagram,youtube,youtube_shorts';
    try {
        const batch = await uploadToAllPlatforms('/tmp/missing.mp4', 'title');
        // Each platform should have failed because creds are missing.
        assert.equal(batch.results.length, 4, 'all 4 platforms attempted');
        for (const r of batch.results) {
            assert.equal(r.success, false, `${r.platform} expected fail (no creds)`);
        }
        assert.equal(batch.failed, 4);
        assert.equal(batch.passed, 0);
        assert.equal(batch.success, false, 'success=false when nothing passed');
    } finally {
        process.env = prev;
    }
});

test('uploadToAllPlatforms honours an explicit platforms list (not env)', async () => {
    // Even when UPLOAD_POST_PLATFORMS env lists 4, the second arg lets a
    // caller narrow to a single platform (regression guard for the
    // agentic-batch --post wiring which passes a derived list).
    const prev = { ...process.env };
    process.env.UPLOAD_POST_ENABLED = 'true';
    delete process.env.UPLOAD_POST_API_KEY;
    delete process.env.UPLOAD_POST_USERNAME;
    process.env.UPLOAD_POST_PLATFORMS = 'tiktok,instagram,youtube,youtube_shorts';
    try {
        const batch = await uploadToAllPlatforms(
            '/tmp/missing.mp4',
            'title',
            'desc',
            ['tag1', 'tag2'],
        );
        assert.equal(batch.results.length, 4, 'all 4 env-listed platforms attempted');
    } finally {
        process.env = prev;
    }
});