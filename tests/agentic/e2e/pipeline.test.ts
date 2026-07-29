/**
 * pipeline.test.ts — agentic pipeline end-to-end integration test (1-scene).
 *
 * Validates the full plan→render cycle WITHOUT external API calls:
 *   1. Create a temp workspace and a placeholder test image via ffmpeg
 *   2. Build a minimal Plan in memory
 *   3. Synthesize the PipelineResult and run renderAgenticSlideshow
 *   4. Assert the output MP4 exists and is larger than zero bytes
 *   5. Clean up all temp files
 *
 * Run:  npx tsx --test tests/agentic/e2e/pipeline.test.ts
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import type { Plan } from '../../../src/agentic/types.js';

const ffmpeg: string = require('ffmpeg-static');

// ─── Temp workspace ──────────────────────────────────────────────────────────

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-e2e-'));
const JOB_ID = 'e2e_test_job';
const WS_ROOT = path.join(TMP_ROOT, 'workspace', 'jobs', JOB_ID);
const ASSETS_DIR = path.join(WS_ROOT, 'assets');
const AUDIO_DIR = path.join(WS_ROOT, 'audio');
const RENDER_DIR = path.join(WS_ROOT, 'render');
const OUTPUT_DIR = path.join(TMP_ROOT, 'output', JOB_ID);

for (const d of [ASSETS_DIR, AUDIO_DIR, RENDER_DIR, OUTPUT_DIR]) {
    fs.mkdirSync(d, { recursive: true });
}

// ─── Create a placeholder test image ─────────────────────────────────────────

const TEST_IMAGE = path.join(ASSETS_DIR, 'scene_1.jpg');
const TEST_VIDEO = path.join(ASSETS_DIR, 'scene_1.mp4');

execFileSync(ffmpeg, [
    '-f', 'lavfi', '-i', 'color=c=blue:s=720x1280:d=5:r=25',
    '-frames:v', '1',
    '-y', TEST_IMAGE,
], { stdio: 'ignore' });

// Also encode a short 5-second video from the same source (needed by renderer)
execFileSync(ffmpeg, [
    '-f', 'lavfi', '-i', 'color=c=blue:s=720x1280:d=5:r=25',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-t', '5',
    '-y', TEST_VIDEO,
], { stdio: 'ignore' });

assert.ok(fs.existsSync(TEST_IMAGE), 'test image should exist');
assert.ok(fs.statSync(TEST_IMAGE).size > 0, 'test image should have content');

// ─── Helper: create a minimal PipelineResult ─────────────────────────────────

function makePipelineResult(): any {
    const plan: Plan = {
        jobId: JOB_ID,
        title: 'E2E Test',
        orientation: 'portrait',
        voice: 'en-US-JennyNeural',
        musicQuery: 'ambient lofi',
        scenes: [{
            sceneNumber: 1,
            voiceoverText: 'Hello from the e2e integration test.',
            searchKeywords: ['test'],
            visualPreference: 'image',
            durationSec: 5,
        }],
        totalDurationSec: 5,
    };

    const workspace = {
        root: WS_ROOT,
        assetsDir: ASSETS_DIR,
        imagesDir: path.join(ASSETS_DIR, 'images'),
        videosDir: path.join(ASSETS_DIR, 'videos'),
        musicDir: path.join(ASSETS_DIR, 'music'),
        audioDir: AUDIO_DIR,
        verificationDir: path.join(WS_ROOT, 'verification'),
        jobId: JOB_ID,
    };

    return {
        backend: 'agent',
        plan,
        workspace,
        candidates: [],
        decisions: [],
        gate: { pass: true, checks: [] },
        manifest: {
            assets: [{
                sceneIndex: 0,
                kind: 'image' as const,
                localPath: TEST_IMAGE,
                durationSec: 5,
            }],
            voiceoverDriven: false,
        },
        voiceovers: null,
        fullyAgentDriven: true,
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('E2E: pipeline plan→render produces a valid output file', async () => {
    const { renderAgenticSlideshow } = await import('../../../src/agentic/orchestrator/render.js');

    const result = makePipelineResult();
    const outPath = path.join(OUTPUT_DIR, 'e2e_test_output.mp4');

    const outputFile = await renderAgenticSlideshow(result, {
        outPath,
        crossfadeSec: 0,
        burnCaptions: false,
        vignette: false,
        sfx: false,
    });

    assert.ok(outputFile, 'renderAgenticSlideshow should return an output path');
    assert.ok(fs.existsSync(outputFile), `output file should exist: ${outputFile}`);
    assert.ok(fs.statSync(outputFile).size > 0, 'output file should be larger than zero bytes');

    console.log(`  ✅ E2E render produced: ${outputFile} (${(fs.statSync(outputFile).size / 1024).toFixed(1)} KB)`);
});

test('E2E: render output is a valid MP4 (can be probed)', () => {
    const outPath = path.join(OUTPUT_DIR, 'e2e_test_output.mp4');
    assert.ok(fs.existsSync(outPath), 'output from previous test should exist');

    const probe = require('child_process').spawnSync(ffmpeg, ['-i', outPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    // ffmpeg prints info to stderr; check for key metadata
    const stderr: string = String(probe.stderr ?? '');
    assert.ok(
        stderr.includes('Video:') || stderr.includes('Duration:'),
        'ffprobe should report video stream metadata',
    );
});

// ─── Cleanup ─────────────────────────────────────────────────────────────────

after(() => {
    try {
        fs.rmSync(TMP_ROOT, { recursive: true, force: true });
        console.log(`  🧹 Cleaned up: ${TMP_ROOT}`);
    } catch {
        // best-effort cleanup
    }
});
