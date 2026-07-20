import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createVideoPipeline } from '../src/index.js';

describe('VideoPipeline (mock mode)', () => {
  it('should create pipeline with all provider chains', () => {
    const pipeline = createVideoPipeline({ mockOnly: true });
    assert.ok(pipeline, 'Pipeline should be created');
  });

  it('should generate video from topic using mock providers', { timeout: 10000 }, async () => {
    const pipeline = createVideoPipeline({ mockOnly: true });
    const result = await pipeline.generateVideo({
      topic: 'Test topic for pipeline verification',
      style: 'test',
      duration: 10,
      resolution: { width: 1080, height: 1920 },
      aspectRatio: '9:16',
      fps: 30,
      outputDir: './output',
    });

    assert.ok(result, 'Pipeline should return a result');
    assert.equal(result.scenes > 0, true, 'Should have at least one scene');
    assert.equal(result.totalDuration > 0, true, 'Should have positive duration');
    assert.equal(result.providersUsed.length > 0, true, 'Should have used providers');
    assert.ok(result.script, 'Should have script');
    assert.ok(result.storyboard, 'Should have storyboard');
  });

  it('script chain should produce valid scenes', { timeout: 10000 }, async () => {
    const pipeline = createVideoPipeline({ mockOnly: true });
    const result = await pipeline.generateVideo({
      topic: 'Artificial Intelligence',
      duration: 15,
      outputDir: './output',
    });

    assert.ok(result.script.scenes.length >= 2, `Should generate at least 2 scenes, got ${result.script.scenes.length}`);
    for (const scene of result.script.scenes) {
      assert.ok(scene.sceneNumber > 0, 'Scene should have positive number');
      assert.ok(scene.narration.length > 0, 'Scene should have narration');
      assert.ok(scene.duration > 0, 'Scene should have positive duration');
      assert.ok(scene.keywords.length > 0, 'Scene should have keywords');
      assert.ok(scene.visualPrompt.length > 0, 'Scene should have visual prompt');
    }
  });

  it('storyboard chain should produce image paths for each scene', { timeout: 10000 }, async () => {
    const pipeline = createVideoPipeline({ mockOnly: true });
    const result = await pipeline.generateVideo({
      topic: 'Space Exploration',
      duration: 15,
      outputDir: './output',
    });

    assert.ok(result.storyboard.scenes.length > 0, 'Should have storyboard scenes');
    for (const scene of result.storyboard.scenes) {
      assert.ok(scene.imagePath.length > 0, 'Scene should have image path');
      assert.ok(scene.narration.length > 0, 'Scene should have narration');
    }
  });
});
