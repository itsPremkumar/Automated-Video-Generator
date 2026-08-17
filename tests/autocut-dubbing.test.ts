/**
 * autocut-dubbing.test.ts — Tests for new video features.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';

// ─── AutoCut Scene Detection ────────────────────────────────────────────────

test('autocut detectScenes requires valid file', async () => {
    const { detectScenes } = await import('../src/lib/video/autocut/scene-detect.js');
    try {
        await detectScenes('/tmp/nonexistent.mp4');
        assert.fail('should throw');
    } catch (e: any) {
        assert.ok(e.message.includes('not found'), 'throws when file missing');
    }
});

test('autocut smartAssemble requires valid file', async () => {
    const { smartAssemble } = await import('../src/lib/video/autocut/scene-detect.js');
    try {
        await smartAssemble({ inputPath: '/tmp/nonexistent.mp4', outputPath: '/tmp/out.mp4' });
        assert.fail('should throw');
    } catch (e: any) {
        assert.ok(e.message.includes('not found'), 'throws when file missing');
    }
});

// ─── Voice Cloning ──────────────────────────────────────────────────────────

test('voice-clone isCoquiAvailable returns boolean', async () => {
    const { isCoquiAvailable } = await import('../src/agentic/services/voice/clone.js');
    const result = isCoquiAvailable();
    assert.equal(typeof result, 'boolean', 'returns boolean');
});

test('voice-clone getVoiceCloneModels returns array', async () => {
    const { getVoiceCloneModels } = await import('../src/agentic/services/voice/clone.js');
    const models = getVoiceCloneModels();
    assert.ok(Array.isArray(models), 'returns array');
    assert.ok(models.length > 0, 'has models');
});

test('voice-clone requires valid reference audio', async () => {
    const { cloneVoice } = await import('../src/agentic/services/voice/clone.js');
    try {
        await cloneVoice({ referenceAudio: '/tmp/nonexistent.wav', text: 'test', outputPath: '/tmp/out.mp3' });
        assert.fail('should throw');
    } catch (e: any) {
        assert.ok(e.message.includes('not found'), 'throws when reference missing');
    }
});

// ─── Voice Changer ──────────────────────────────────────────────────────────

test('voice-changer listVoiceEffects returns all effects', async () => {
    const { listVoiceEffects } = await import('../src/agentic/services/voice/changer.js');
    const effects = listVoiceEffects();
    assert.ok(effects.length >= 5, 'has at least 5 effects');
    assert.ok(effects.includes('deep'), 'includes deep');
    assert.ok(effects.includes('robot'), 'includes robot');
    assert.ok(effects.includes('telephone'), 'includes telephone');
});

test('voice-changer changeVoice requires valid file', async () => {
    const { changeVoice } = await import('../src/agentic/services/voice/changer.js');
    try {
        await changeVoice({ inputPath: '/tmp/nonexistent.mp3', outputPath: '/tmp/out.mp3' });
        assert.fail('should throw');
    } catch (e: any) {
        assert.ok(e.message.includes('not found'), 'throws when file missing');
    }
});

// ─── Video Dubbing / Translation ────────────────────────────────────────────

test('dubbing extractAudio requires valid file', async () => {
    const { extractAudio } = await import('../src/lib/video/dubbing/translate.js');
    try {
        await extractAudio('/tmp/nonexistent.mp4', '/tmp/out.mp3');
        assert.fail('should throw');
    } catch (e: any) {
        assert.ok(e.message.includes('not found'), 'throws when file missing');
    }
});

test('dubbing replaceAudio requires valid files', async () => {
    const { replaceAudio } = await import('../src/lib/video/dubbing/translate.js');
    try {
        await replaceAudio('/tmp/nonexistent.mp4', '/tmp/nonexistent.mp3', '/tmp/out.mp4');
        assert.fail('should throw');
    } catch (e: any) {
        assert.ok(e.message.includes('not found'), 'throws when files missing');
    }
});

test('dubbing translateText falls back gracefully', async () => {
    const { translateText } = await import('../src/lib/video/dubbing/translate.js');
    const result = await translateText('Hello world', 'es');
    assert.ok(typeof result === 'string', 'returns string');
});

// ─── URL to Video ───────────────────────────────────────────────────────────

test('url-to-video generateScriptFromText works', async () => {
    const { generateScriptFromText } = await import('../src/lib/video/url-to-video.js');
    const text = 'First sentence here. Second sentence with more detail. Third sentence to complete the thought.';
    const scenes = generateScriptFromText(text, 3);
    assert.ok(scenes.length > 0, 'generates scenes');
    assert.ok(scenes.length <= 3, 'respects max scenes');
});

test('url-to-video generateScriptFromText handles empty text', async () => {
    const { generateScriptFromText } = await import('../src/lib/video/url-to-video.js');
    const scenes = generateScriptFromText('', 3);
    assert.ok(scenes.length > 0, 'generates at least one scene');
});

test('url-to-video textToScript requires valid file', async () => {
    const { textToScript } = await import('../src/lib/video/url-to-video.js');
    try {
        textToScript('/tmp/nonexistent.txt');
        assert.fail('should throw');
    } catch (e: any) {
        assert.ok(e.message.includes('not found'), 'throws when file missing');
    }
});

// ─── Video Template ─────────────────────────────────────────────────────────

test('video-template generateScriptFromText works', async () => {
    const { generateScriptFromText } = await import('../src/lib/video/url-to-video.js');
    const text = 'AI is transforming video creation. New tools emerge every day. Content creators benefit greatly.';
    const scenes = generateScriptFromText(text, 3);
    assert.ok(scenes.length === 3, 'generates correct number of scenes');
});
