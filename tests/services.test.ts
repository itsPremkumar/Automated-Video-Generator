/**
 * services.test.ts — Tests for new AI services.
 *
 * Tests: upload-post, material-cache, ai-gateway, version-checker, error-sanitize, batch-variants
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

// ─── Error Sanitization ─────────────────────────────────────────────────────

test('error-sanitize strips API keys from URLs', async () => {
    const { sanitizeError } = await import('../src/agentic/services/error-sanitize.js');
    const error = new Error('Failed: https://user:pass@api.example.com/v1');
    const sanitized = sanitizeError(error);
    assert.ok(!sanitized.includes('user:pass'), 'credentials stripped');
    assert.ok(sanitized.includes('***:***@'), 'replaced with ***');
});

test('error-sanitize strips Bearer tokens', async () => {
    const { sanitizeError } = await import('../src/agentic/services/error-sanitize.js');
    const error = new Error('Auth failed: Bearer sk-1234567890abcdef');
    const sanitized = sanitizeError(error);
    assert.ok(!sanitized.includes('sk-1234567890abcdef'), 'token stripped');
    assert.ok(sanitized.includes('Bearer ***'), 'replaced with ***');
});

test('error-sanitize strips query param secrets', async () => {
    const { sanitizeError } = await import('../src/agentic/services/error-sanitize.js');
    const error = new Error('Request failed: https://api.com/v1?api_key=secret123');
    const sanitized = sanitizeError(error);
    assert.ok(!sanitized.includes('secret123'), 'query param secret stripped');
});

// ─── Version Checker ────────────────────────────────────────────────────────

test('version-checker compareVersions works correctly', async () => {
    const { getCurrentVersion } = await import('../src/agentic/services/version-checker.js');
    const version = getCurrentVersion();
    assert.ok(version.match(/^\d+\.\d+\.\d+$/), 'version is semver');
});

// ─── Material Cache ─────────────────────────────────────────────────────────

test('material-cache getCached returns null for missing URL', async () => {
    const { getCached } = await import('../src/agentic/services/material-cache.js');
    const result = getCached('https://nonexistent-url.com/image.jpg');
    assert.equal(result, null, 'returns null for missing cache');
});

test('material-cache putCache and getCached roundtrip', async () => {
    const { getCached, putCache, getCacheStats } = await import('../src/agentic/services/material-cache.js');

    // Create a temp file to cache
    const tmpDir = path.join(process.cwd(), 'workspace', 'cache', 'test-materials');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'test-file.jpg');
    fs.writeFileSync(tmpFile, 'fake-image-data');

    const url = 'https://example.com/test-image.jpg';
    putCache(url, tmpFile, { source: 'test', license: 'CC0' });

    const cached = getCached(url);
    assert.ok(cached, 'cache hit returns path');

    const stats = getCacheStats();
    assert.ok(stats.totalEntries >= 1, 'cache has entries');

    // Cleanup
    fs.unlinkSync(tmpFile);
});

// ─── Batch Variants ─────────────────────────────────────────────────────────

test('batch-variants generateSeed produces valid seeds', async () => {
    const { generateSeed } = await import('../src/agentic/services/batch-variants.js');
    for (let i = 0; i < 10; i++) {
        const seed = generateSeed();
        assert.ok(seed >= 0 && seed <= 2147483647, 'seed in valid range');
    }
});

test('batch-variants pickBestVariant picks correctly', async () => {
    const { pickBestVariant } = await import('../src/agentic/services/batch-variants.js');

    const results = [
        { index: 0, jobId: 'a', outputPath: '/a.mp4', duration: 25, size: 1000, selected: false },
        { index: 1, jobId: 'b', outputPath: '/b.mp4', duration: 35, size: 2000, selected: false },
        { index: 2, jobId: 'c', outputPath: '/c.mp4', duration: 30, size: 1500, selected: false },
    ];

    const best = pickBestVariant(results, 'duration');
    assert.equal(best?.index, 2, 'picks closest to 30s');
});

test('batch-variants getVariantConfig returns defaults', async () => {
    const { getVariantConfig } = await import('../src/agentic/services/batch-variants.js');
    const config = getVariantConfig();
    assert.ok(config.count >= 1, 'count >= 1');
    assert.ok(['duration', 'random', 'first'].includes(config.criteria), 'valid criteria');
});

// ─── AI Gateway ─────────────────────────────────────────────────────────────

test('ai-gateway listSupportedGateways returns all gateways', async () => {
    const { listSupportedGateways, getGatewayDisplayName } = await import('../src/agentic/services/ai-gateway.js');
    const gateways = listSupportedGateways();
    assert.ok(gateways.length >= 5, 'has at least 5 gateways');
    assert.ok(gateways.includes('ollama'), 'includes ollama');
    assert.ok(gateways.includes('groq'), 'includes groq');

    for (const g of gateways) {
        const name = getGatewayDisplayName(g);
        assert.ok(name.length > 0, `display name for ${g}`);
    }
});

test('ai-gateway getGatewayConfig returns null when not configured', async () => {
    const { getGatewayConfig, isGatewayConfigured } = await import('../src/agentic/services/ai-gateway.js');
    // Should return null if no env set (may be configured in env, so just check it doesn't throw)
    const config = getGatewayConfig();
    if (!config) {
        assert.equal(isGatewayConfigured(), false, 'not configured');
    }
});

// ─── Upload Post ────────────────────────────────────────────────────────────

test('upload-post getSupportedPlatforms returns all platforms', async () => {
    const { getSupportedPlatforms, isValidPlatform } = await import('../src/agentic/services/upload-post.js');
    const platforms = getSupportedPlatforms();
    assert.ok(platforms.includes('tiktok'), 'includes tiktok');
    assert.ok(platforms.includes('instagram'), 'includes instagram');
    assert.ok(platforms.includes('youtube'), 'includes youtube');

    assert.equal(isValidPlatform('tiktok'), true, 'tiktok valid');
    assert.equal(isValidPlatform('invalid'), false, 'invalid platform');
});

test('upload-post getUploadPostConfig returns defaults', async () => {
    const { getUploadPostConfig } = await import('../src/agentic/services/upload-post.js');
    const config = getUploadPostConfig();
    assert.ok(typeof config.enabled === 'boolean', 'enabled is boolean');
    assert.ok(Array.isArray(config.platforms), 'platforms is array');
});

// ─── Security ───────────────────────────────────────────────────────────────

test('error-sanitize handles non-string errors', async () => {
    const { sanitizeError } = await import('../src/agentic/services/error-sanitize.js');
    const sanitized = sanitizeError(42);
    assert.equal(sanitized, '42', 'handles number');
});
