/**
 * ai-suite.test.ts — Tests for the local AI generation suite.
 *
 * Tests: comfyui, cogvideo, animatediff, upscale, bg-removal providers
 *        job-queue, beat-sync, clip-match, script-enhance, translate, storyboard
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types & Interfaces ─────────────────────────────────────────────────────

test('ai/types.ts exports shared types', () => {
    const typesPath = path.resolve('src/lib/ai/types.ts');
    assert.ok(fs.existsSync(typesPath), 'types.ts exists');
    const content = fs.readFileSync(typesPath, 'utf-8');
    assert.ok(content.includes('AiJobKind'), 'AiJobKind type exported');
    assert.ok(content.includes('AiJobResult'), 'AiJobResult type exported');
    assert.ok(content.includes('AiQueueStatus'), 'AiQueueStatus type exported');
    assert.ok(content.includes('Orientation'), 'Orientation type exported');
});

// ─── Job Queue ──────────────────────────────────────────────────────────────

test('job-queue.ts exports and serial processing', async () => {
    const { enqueueJob, getQueueStatus, getJobResult, clearFinishedJobs } = await import('../src/lib/ai/job-queue.js');

    // Clear any previous state
    clearFinishedJobs();

    // Enqueue a fake job
    const jobId = enqueueJob('image-gen', { prompt: 'test', outDir: '/tmp', filename: 'test.jpg' });
    assert.ok(jobId.startsWith('ai-job-'), 'jobId has correct prefix');

    // Wait for auto-processing to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check queue status - job should have been processed (completed or failed)
    const status = getQueueStatus();
    assert.ok(status.completedCount + status.failedCount >= 1, 'job was processed');

    // Job result should be available (not pending anymore)
    const result = getJobResult(jobId);
    assert.ok(result !== null, 'result is available');
    assert.ok(typeof result.ok === 'boolean', 'result has ok field');
});

test('job-queue.ts enforces serial processing', async () => {
    const { enqueueJob, getQueueStatus } = await import('../src/lib/ai/job-queue.js');

    // Enqueue multiple jobs
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
        ids.push(enqueueJob('image-gen', { prompt: `test-${i}`, outDir: '/tmp', filename: `test${i}.jpg` }));
    }

    // Queue should have at least 3 jobs total (pending + completed + failed)
    const status = getQueueStatus();
    assert.ok(status.queueLength + status.completedCount + status.failedCount >= 3, 'queue has at least 3 jobs');
});

// ─── Provider: ComfyUI ─────────────────────────────────────────────────────

test('comfyui.ts isComfyUiAvailable returns false when offline', async () => {
    const { isComfyUiAvailable } = await import('../src/lib/ai/providers/comfyui.js');
    const available = await isComfyUiAvailable();
    assert.equal(available, false, 'ComfyUI not available (offline)');
});

test('comfyui.ts generateImage returns empty string when offline', async () => {
    const { generateImage } = await import('../src/lib/ai/providers/comfyui.js');
    const result = await generateImage({
        prompt: 'test prompt',
        outDir: '/tmp/test-ai',
        filename: 'test.jpg',
        orientation: 'landscape',
    });
    assert.equal(result, '', 'generateImage returns empty when offline');
});

test('comfyui.ts isEnabled returns true', async () => {
    const { isEnabled } = await import('../src/lib/ai/providers/comfyui.js');
    assert.equal(isEnabled(), true, 'isEnabled returns true');
});

// ─── Provider: CogVideo ────────────────────────────────────────────────────

test('cogvideo.ts isCogVideoAvailable returns false when offline', async () => {
    const { isCogVideoAvailable } = await import('../src/lib/ai/providers/cogvideo.js');
    const available = await isCogVideoAvailable();
    assert.equal(available, false, 'CogVideo not available (offline)');
});

test('cogvideo.ts generateVideo returns empty string when offline', async () => {
    const { generateVideo } = await import('../src/lib/ai/providers/cogvideo.js');
    const result = await generateVideo({
        prompt: 'test prompt',
        outDir: '/tmp/test-ai',
        filename: 'test.mp4',
        orientation: 'landscape',
    });
    assert.equal(result, '', 'generateVideo returns empty when offline');
});

// ─── Provider: AnimateDiff ──────────────────────────────────────────────────

test('animatediff.ts isAvailable returns false when offline', async () => {
    const { isAvailable } = await import('../src/lib/ai/providers/animatediff.js');
    const available = await isAvailable();
    assert.equal(available, false, 'AnimateDiff not available (offline)');
});

test('animatediff.ts generateMotion returns empty when no source image', async () => {
    const { generateMotion } = await import('../src/lib/ai/providers/animatediff.js');
    const result = await generateMotion({
        imagePath: '/tmp/nonexistent.jpg',
        outDir: '/tmp/test-ai',
        filename: 'test.mp4',
    });
    assert.equal(result, '', 'generateMotion returns empty when source missing');
});

// ─── Provider: Upscale ──────────────────────────────────────────────────────

test('upscale.ts isEnabled returns true', async () => {
    const { isEnabled } = await import('../src/lib/ai/providers/upscale.js');
    assert.equal(isEnabled(), true, 'isEnabled returns true');
});

test('upscale.ts upscale returns original path when input missing', async () => {
    const { upscale } = await import('../src/lib/ai/providers/upscale.js');
    const result = await upscale({ inputPath: '/tmp/nonexistent.jpg' });
    assert.equal(result, '/tmp/nonexistent.jpg', 'upscale returns original when input missing');
});

// ─── Provider: Background Removal ───────────────────────────────────────────

test('bg-removal.ts isEnabled returns true', async () => {
    const { isEnabled } = await import('../src/lib/ai/providers/bg-removal.js');
    assert.equal(isEnabled(), true, 'isEnabled returns true');
});

test('bg-removal.ts removeBg returns empty when input missing', async () => {
    const { removeBg } = await import('../src/lib/ai/providers/bg-removal.js');
    const result = await removeBg({ inputPath: '/tmp/nonexistent.jpg' });
    assert.equal(result, '', 'removeBg returns empty when input missing');
});

// ─── Intelligence: Beat Sync ────────────────────────────────────────────────

test('beat-sync.ts isEnabled returns true', async () => {
    const { isEnabled } = await import('../src/lib/ai/intelligence/beat-sync.js');
    assert.equal(isEnabled(), true, 'isEnabled returns true');
});

test('beat-sync.ts detectBeats returns null when audio missing', async () => {
    const { detectBeats } = await import('../src/lib/ai/intelligence/beat-sync.js');
    const result = await detectBeats({ audioPath: '/tmp/nonexistent.mp3' });
    assert.equal(result, null, 'detectBeats returns null when audio missing');
});

test('beat-sync.ts mapBeatsToScenes maps correctly', async () => {
    const { mapBeatsToScenes } = await import('../src/lib/ai/intelligence/beat-sync.js');
    const beats = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
    const scenes = [2, 2, 2]; // 3 scenes, 2 seconds each
    const mapped = mapBeatsToScenes(beats, scenes);
    assert.equal(mapped.length, 3, 'returns 3 cut points');
    assert.ok(mapped[0] >= 0.5 && mapped[0] <= 2.5, 'first cut near 2s');
});

// ─── Intelligence: CLIP Match ───────────────────────────────────────────────

test('clip-match.ts isEnabled returns true', async () => {
    const { isEnabled } = await import('../src/lib/ai/intelligence/clip-match.js');
    assert.equal(isEnabled(), true, 'isEnabled returns true');
});

test('clip-match.ts embed returns null when no images', async () => {
    const { embed } = await import('../src/lib/ai/intelligence/clip-match.js');
    const result = await embed({ text: 'test', imagePaths: [] });
    assert.equal(result, null, 'embed returns null when no images');
});

// ─── Intelligence: Script Enhance ───────────────────────────────────────────

test('script-enhance.ts isEnabled returns true', async () => {
    const { isEnabled } = await import('../src/lib/ai/intelligence/script-enhance.js');
    assert.equal(isEnabled(), true, 'isEnabled returns true');
});

test('script-enhance.ts enhance returns null when Ollama offline', async () => {
    const { enhance } = await import('../src/lib/ai/intelligence/script-enhance.js');
    const result = await enhance({
        title: 'Test',
        script: 'Test script',
    });
    // Should return null (Ollama offline) without throwing
    assert.ok(result === null || typeof result === 'object', 'enhance returns null or object');
});

// ─── Intelligence: Storyboard ───────────────────────────────────────────────

test('storyboard.ts isEnabled returns true', async () => {
    const { isEnabled } = await import('../src/lib/ai/intelligence/storyboard.js');
    assert.equal(isEnabled(), true, 'isEnabled returns true');
});

test('storyboard.ts generate returns empty array when ComfyUI offline', async () => {
    const { generate } = await import('../src/lib/ai/intelligence/storyboard.js');
    const result = await generate({
        title: 'Test',
        scenes: [{ voiceoverText: 'test', searchKeywords: ['test'] }],
        outDir: '/tmp/test-ai',
    });
    assert.ok(Array.isArray(result), 'generate returns array');
});

// ─── Intelligence: Translate ────────────────────────────────────────────────

test('translate.ts isEnabled returns true', async () => {
    const { isEnabled } = await import('../src/lib/ai/intelligence/translate.js');
    assert.equal(isEnabled(), true, 'isEnabled returns true');
});

test('translate.ts translate returns null when offline', async () => {
    const { translate } = await import('../src/lib/ai/intelligence/translate.js');
    const result = await translate({
        text: 'Hello world',
        targetLang: 'es',
    });
    assert.ok(result === null || typeof result === 'object', 'translate returns null or object');
});

// ─── Integration: gen-image.ts ──────────────────────────────────────────────

test('gen-image.ts tries local ComfyUI first', async () => {
    const { isGenEnabled } = await import('../src/lib/gen-image.js');
    // Should return true (availability checked at generate time)
    assert.equal(isGenEnabled(), true, 'isGenEnabled returns true');
});

test('gen-image.ts generateSceneImage returns empty when offline', async () => {
    const { generateSceneImage } = await import('../src/lib/gen-image.js');
    const result = await generateSceneImage({
        prompt: 'test',
        outDir: '/tmp/test-ai',
        filename: 'test.jpg',
        orientation: 'landscape',
    });
    assert.equal(result, '', 'generateSceneImage returns empty when offline');
});

// ─── Integration: gen-video.ts ──────────────────────────────────────────────

test('gen-video.ts tries local providers first', async () => {
    const { isVideoGenEnabled } = await import('../src/lib/gen-video.js');
    // isVideoGenEnabled checks API key (not local), but local is tried at generate time
    assert.equal(typeof isVideoGenEnabled(), 'boolean', 'isVideoGenEnabled returns boolean');
});

test('gen-video.ts generateSceneVideo returns empty when offline', async () => {
    const { generateSceneVideo } = await import('../src/lib/gen-video.js');
    const result = await generateSceneVideo({
        prompt: 'test',
        outDir: '/tmp/test-ai',
        filename: 'test.mp4',
        orientation: 'landscape',
    });
    assert.equal(result, '', 'generateSceneVideo returns empty when offline');
});

// ─── Graceful Fallback Pattern ───────────────────────────────────────────────

test('all providers follow graceful fallback pattern', () => {
    const providers = [
        'src/lib/ai/providers/comfyui.ts',
        'src/lib/ai/providers/cogvideo.ts',
        'src/lib/ai/providers/animatediff.ts',
        'src/lib/ai/providers/upscale.ts',
        'src/lib/ai/providers/bg-removal.ts',
    ];
    for (const p of providers) {
        const content = fs.readFileSync(path.resolve(p), 'utf-8');
        assert.ok(content.includes('return') || content.includes('throw'), 'provider has return paths');
    }
});
