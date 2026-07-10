/**
 * Integration smoke test for the core video-generation pipeline.
 *
 * This exercises the real orchestration pieces (script parsing, input
 * validation, workspace assembly) WITHOUT triggering network media fetches or
 * the heavy Remotion render, so it stays fast and deterministic in CI.
 *
 * It guards against regressions in the parts of `video-generator.ts` that the
 * unit tests do not cover: the parse -> validate -> workspace flow and the
 * early-exit contract for invalid input.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import { parseScript, validateScript, ParsedScript } from './lib/script-parser';
import { createPipelineWorkspace, ensurePipelineWorkspace, sanitizeOutputId } from './pipeline-workspace';

const SAMPLE_SCRIPT = `Welcome to your very first video! The installation was completely successful.

[Visual: fast typing on computer keyboard]
This script was automatically generated as a test to prove that your local text-to-video studio works perfectly.

[Visual: happy person celebrating success]
You can now edit this text to whatever you want, pick a voice, and start creating!`;

test('parseScript extracts scenes and honours [Visual:] director tags', async () => {
    const parsed: ParsedScript = await parseScript(SAMPLE_SCRIPT);

    assert.ok(parsed.scenes.length >= 3, `expected at least 3 scenes, got ${parsed.scenes.length}`);
    assert.ok(parsed.totalDuration > 0, 'totalDuration should be positive');

    // The second and third scenes carry explicit visual cues from the tags.
    const tagged = parsed.scenes.filter(s => s.searchKeywords.some(k => /keyboard|celebrat/i.test(k)));
    assert.ok(tagged.length >= 1, 'at least one scene should inherit a [Visual:] keyword');

    // Every scene should have a non-empty visual description and a duration >= 3s.
    for (const scene of parsed.scenes) {
        assert.ok(scene.visualDescription.length > 0, 'scene missing visual description');
        assert.ok(scene.duration >= 3, `scene ${scene.sceneNumber} duration below minimum`);
    }
});

test('validateScript enforces length boundaries', () => {
    assert.throws(() => validateScript(''), /empty/i);
    assert.throws(() => validateScript('too short'), /too short/i);
    assert.throws(() => validateScript('x'.repeat(5001)), /too long/i);

    // A [Visual:] tag alone should be allowed even when very short.
    assert.doesNotThrow(() => validateScript('[Visual: mountain sunrise]', false));
});

test('pipeline workspace is created with the expected sub-directories', async () => {
    const workspace = createPipelineWorkspace(path.join('output', 'integration_smoke'), 'smoke_job_123');
    ensurePipelineWorkspace(workspace);

    for (const dir of [workspace.workspaceDir, workspace.videosDir, workspace.audioDir, workspace.visualsDir]) {
        assert.ok(fs.existsSync(dir), `expected workspace dir to exist: ${dir}`);
    }

    // Cleanup so the test leaves no stray artifacts.
    fs.rmSync(workspace.workspaceDir, { recursive: true, force: true });
});

test('sanitizeOutputId strips unsafe characters and enforces length', () => {
    assert.equal(sanitizeOutputId('my cool/video!'), 'my_cool_video');
    assert.equal(sanitizeOutputId(''), 'video');
    assert.equal(sanitizeOutputId('a'.repeat(200)).length, 80);
});
