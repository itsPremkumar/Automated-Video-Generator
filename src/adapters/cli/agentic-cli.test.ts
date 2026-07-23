/**
 * agentic-cli.test.ts — verifies the script-JSON → PipelineRequest mapping
 * exposes the FULL control surface (including the control-surface extension:
 * aiVerify, pruneWorkspaces, brain, dryRun, defaultVisual, agent).
 *
 * Runs OFFLINE: buildPipelineRequest is a pure function — no pipeline, no network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPipelineRequest } from './cli-job.js';
import type { AgenticCliJob } from './cli-job.js';

function baseJob(): AgenticCliJob {
    return { id: 't1', title: 'Test', script: 'Hello [Visual: cat] [Transition: fade]' };
}

test('buildPipelineRequest forwards the control-surface extension fields', () => {
    const job: AgenticCliJob = {
        ...baseJob(),
        aiVerify: { enabled: true, minConfidence: 7, checkSubjectMatch: true },
        pruneWorkspaces: 2,
        brain: { maxCalls: 50, maxFails: 3 },
        dryRun: true,
        defaultVisual: 'fallback.png',
        agent: { writeScript: async () => 'x' },
    };

    const req = buildPipelineRequest(job, 't1', 'Test');

    assert.deepEqual(req.aiVerify, { enabled: true, minConfidence: 7, checkSubjectMatch: true });
    assert.equal(req.pruneWorkspaces, 2);
    assert.deepEqual(req.brain, { maxCalls: 50, maxFails: 3 });
    assert.equal(req.dryRun, true);
    assert.equal(req.defaultVisual, 'fallback.png');
    assert.equal(typeof req.agent?.writeScript, 'function');
});

test('buildPipelineRequest keeps Phase-1 + legacy fields', () => {
    const job: AgenticCliJob = {
        ...baseJob(),
        orientation: 'landscape',
        voice: 'en-US-GuyNeural',
        captions: 'karaoke',
        sfx: true,
        jCutSec: 0.4,
        preset: 'reels',
        aspect: '1:1',
        vignette: false,
        kineticText: false,
        musicIntensity: 'energetic',
        platform: 'tiktok',
        videoType: 'product',
        brand: { watermark: 'wm.png', accent: '#ff0000' },
        renderer: 'remotion',
        maxAttempts: 5,
        languages: ['tamil', 'hindi'],
        kenBurns: false,
        transition: 'slide',
        grade: 'vivid',
    };

    const req = buildPipelineRequest(job, 't1', 'Test');
    assert.equal(req.orientation, 'landscape');
    assert.equal(req.voice, 'en-US-GuyNeural');
    assert.equal(req.captions, 'karaoke');
    assert.equal(req.sfx, true);
    assert.equal(req.jCutSec, 0.4);
    assert.equal(req.preset, 'reels');
    assert.equal(req.aspect, '1:1');
    assert.equal(req.vignette, false);
    assert.equal(req.kineticText, false);
    assert.equal(req.musicIntensity, 'energetic');
    assert.equal(req.platform, 'tiktok');
    assert.equal(req.videoType, 'product');
    assert.deepEqual(req.brand, { watermark: 'wm.png', accent: '#ff0000' });
    assert.equal(req.renderer, 'remotion');
    assert.equal(req.maxAttempts, 5);
    assert.deepEqual(req.languages, ['tamil', 'hindi']);
    assert.equal(req.kenBurns, false);
    assert.equal(req.transition, 'slide');
    assert.equal(req.grade, 'vivid');
});

test('buildPipelineRequest applies documented defaults', () => {
    const req = buildPipelineRequest(baseJob(), 't1', 'Test');
    assert.equal(req.orientation, 'portrait');
    assert.equal(req.backend, 'agent');
    assert.equal(req.candidatesPerAsset, 2);
    assert.equal(req.hookFirst, true);
    assert.equal(req.variablePacing, true);
    // extension fields default to undefined unless the job sets them
    assert.equal(req.aiVerify, undefined);
    assert.equal(req.pruneWorkspaces, undefined);
    assert.equal(req.brain, undefined);
    assert.equal(req.dryRun, undefined);
    assert.equal(req.defaultVisual, undefined);
    assert.equal(req.agent, undefined);
});

test('buildPipelineRequest passes script + id + title through', () => {
    const req = buildPipelineRequest(baseJob(), 'my-id', 'My Topic');
    assert.equal(req.script, 'Hello [Visual: cat] [Transition: fade]');
    assert.equal(req.jobId, 'my-id');
    assert.equal(req.title, 'Test'); // job.title wins over topic
});
