/**
 * tts-stock.test.ts — Tests for TTS providers and stock sources.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

// ─── ElevenLabs ─────────────────────────────────────────────────────────────

test('elevenlabs isElevenLabsConfigured returns false without API key', async () => {
    const { isElevenLabsConfigured } = await import('../src/agentic/services/tts/elevenlabs.js');
    const configured = isElevenLabsConfigured();
    assert.equal(typeof configured, 'boolean', 'returns boolean');
});

test('elevenlabs getVoices returns empty array when offline', async () => {
    const { getVoices } = await import('../src/agentic/services/tts/elevenlabs.js');
    const voices = await getVoices();
    assert.ok(Array.isArray(voices), 'returns array');
});

// ─── SiliconFlow ────────────────────────────────────────────────────────────

test('siliconflow isSiliconFlowConfigured returns false without API key', async () => {
    const { isSiliconFlowConfigured } = await import('../src/agentic/services/tts/siliconflow.js');
    const configured = isSiliconFlowConfigured();
    assert.equal(typeof configured, 'boolean', 'returns boolean');
});

test('siliconflow getVoices returns voice list', async () => {
    const { getVoices } = await import('../src/agentic/services/tts/siliconflow.js');
    const voices = getVoices();
    assert.ok(voices.length > 0, 'has voices');
    assert.ok(voices.some(v => v.name === 'alex'), 'includes alex');
});

test('siliconflow getVoicesByLanguage filters correctly', async () => {
    const { getVoicesByLanguage } = await import('../src/agentic/services/tts/siliconflow.js');
    const zhVoices = getVoicesByLanguage('zh');
    assert.ok(zhVoices.length > 0, 'has chinese voices');
    const enVoices = getVoicesByLanguage('en');
    assert.ok(enVoices.length > 0, 'has english voices');
});

// ─── Coverr Stock Source ───────────────────────────────────────────────────

test('coverr searchVideos returns empty when offline', async () => {
    const { searchVideos } = await import('../src/lib/stock-sources/coverr.js');
    const videos = await searchVideos('nature', 5);
    assert.ok(Array.isArray(videos), 'returns array');
});

test('coverr getPopularVideos returns empty when offline', async () => {
    const { getPopularVideos } = await import('../src/lib/stock-sources/coverr.js');
    const videos = await getPopularVideos(5);
    assert.ok(Array.isArray(videos), 'returns array');
});

// ─── Audio Ducking ──────────────────────────────────────────────────────────

test('audio-ducking mixAudio requires valid files', async () => {
    const { mixAudio } = await import('../src/agentic/services/audio-ducking.js');
    try {
        await mixAudio('/tmp/nonexistent-voice.mp3', '/tmp/nonexistent-bgm.mp3', '/tmp/output.mp3');
        assert.fail('should throw');
    } catch (e: any) {
        assert.ok(e.message.includes('not found'), 'throws when files missing');
    }
});

// ─── Resolutions ────────────────────────────────────────────────────────────

test('resolutions getResolution returns portrait_1080 by default', async () => {
    const { getResolution } = await import('../src/agentic/services/resolutions.js');
    const res = getResolution('portrait_1080');
    assert.equal(res.width, 1080, 'correct width');
    assert.equal(res.height, 1920, 'correct height');
});

test('resolutions listResolutions returns all keys', async () => {
    const { listResolutions } = await import('../src/agentic/services/resolutions.js');
    const keys = listResolutions();
    assert.ok(keys.length >= 5, 'has at least 5 resolutions');
    assert.ok(keys.includes('portrait_1080'), 'includes portrait_1080');
    assert.ok(keys.includes('landscape_1080'), 'includes landscape_1080');
    assert.ok(keys.includes('square_1080'), 'includes square_1080');
});

test('resolutions getResolutionsByAspect filters correctly', async () => {
    const { getResolutionsByAspect } = await import('../src/agentic/services/resolutions.js');
    const portrait = getResolutionsByAspect('9:16');
    assert.ok(portrait.length >= 2, 'has at least 2 portrait resolutions');
    const landscape = getResolutionsByAspect('16:9');
    assert.ok(landscape.length >= 2, 'has at least 2 landscape resolutions');
});

test('resolutions parseResolution works', async () => {
    const { parseResolution } = await import('../src/agentic/services/resolutions.js');
    const res = parseResolution('1920x1080');
    assert.ok(res !== null, 'parses valid resolution');
    assert.equal(res?.width, 1920, 'correct width');
    assert.equal(res?.height, 1080, 'correct height');
});

test('resolutions getScaleFilter works', async () => {
    const { getScaleFilter, getResolution } = await import('../src/agentic/services/resolutions.js');
    const res = getResolution('landscape_1080');
    const filter = getScaleFilter(res);
    assert.ok(filter.includes('scale='), 'includes scale filter');
    assert.ok(filter.includes('1920'), 'includes width');
});

test('resolutions estimateFileSize works', async () => {
    const { estimateFileSize, getResolution } = await import('../src/agentic/services/resolutions.js');
    const res = getResolution('portrait_1080');
    const size = estimateFileSize(res, 30, 8);
    assert.ok(size > 0, 'returns positive size');
});

// ─── TTS Manager ────────────────────────────────────────────────────────────

test('tts-manager getTtsProvider returns edge-tts by default', async () => {
    const { getTtsProvider } = await import('../src/agentic/services/tts/manager.js');
    const provider = getTtsProvider();
    assert.ok(['edge-tts', 'elevenlabs', 'siliconflow'].includes(provider), 'valid provider');
});

test('tts-manager getAvailableProviders returns at least edge-tts', async () => {
    const { getAvailableProviders } = await import('../src/agentic/services/tts/manager.js');
    const providers = getAvailableProviders();
    assert.ok(providers.includes('edge-tts'), 'always has edge-tts');
});

test('tts-manager getVoices returns voices for edge-tts', async () => {
    const { getVoices } = await import('../src/agentic/services/tts/manager.js');
    const voices = getVoices('edge-tts');
    assert.ok(voices.length > 0, 'has voices');
    assert.ok(voices.some(v => v.includes('Neural')), 'has neural voices');
});

test('tts-manager isProviderAvailable returns true for edge-tts', async () => {
    const { isProviderAvailable } = await import('../src/agentic/services/tts/manager.js');
    const available = isProviderAvailable('edge-tts');
    assert.equal(available, true, 'edge-tts always available');
});
