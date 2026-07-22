

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { runVoiceStage } from './voice-controller.js';
import { AgenticWorkspace } from '../management/workspace.js';
import { killBackend } from '../../lib/speech-backend.js';
import { makeWorkspaceTempDir, resolveWorkspaceTempPath } from '../../shared/runtime/paths.js';

// Ensure the controller targets the voicebox provider + real python.
process.env.TTS_PROVIDER = 'voicebox';
process.env.VOICEBOX_PYTHON = process.env.VOICEBOX_PYTHON || 'C:/one/voicebox/.venv/Scripts/python.exe';
// Drop any pre-set profile so we exercise the AUTO-PROVISION path.
delete process.env.VOICEBOX_PROFILE_ID;

function makePlan() {
    return {
        title: 'integration-voice-test',
        voice: 'en-US-AriaNeural',
        scenes: [
            { sceneNumber: 1, voiceoverText: 'Hello from the agentic video generator voice engine.', durationSec: 3 },
            { sceneNumber: 2, voiceoverText: 'This audio was synthesized locally with Kokoro, fully offline.', durationSec: 3 },
        ],
        totalDurationSec: 6,
    } as any;
}

function makeWorkspace(): AgenticWorkspace {
    const root = makeWorkspaceTempDir('voice-test-');
    return {
        jobId: 'voice-test',
        root,
        assetsDir: path.join(root, 'assets'),
        imagesDir: path.join(root, 'assets', 'images'),
        videosDir: path.join(root, 'assets', 'videos'),
        musicDir: path.join(root, 'assets', 'music'),
        verificationDir: path.join(root, 'verification'),
        audioDir: path.join(root, 'audio'),
    };
}

test('runVoiceStage generates real WAVs via live speech backend (auto-provisioned)', { timeout: 240_000 }, async () => {
    const ws = makeWorkspace();
    const plan = makePlan();

    const result = await runVoiceStage(plan, ws, undefined, (p, m) => {
        console.log(`  [progress ${p}%] ${m}`);
    });

    // 1. Both scenes produced audio.
    assert.equal(result.voices.length, 2, 'expected 2 generated voices');
    assert.equal(result.voiceoverDriven, true, 'expected voiceoverDriven=true (real TTS)');

    // 2. Each output is a real WAV (> 1 KB).
    for (const v of result.voices) {
        assert.ok(fs.existsSync(v.audioPath), `audio missing: ${v.audioPath}`);
        const size = fs.statSync(v.audioPath).size;
        assert.ok(size > 1000, `audio too small (${size} bytes): ${v.audioPath}`);
        console.log(`  ✓ ${path.basename(v.audioPath)} (${size} bytes)`);
    }

    // 3. A profile id was resolved (auto-provisioned).
    assert.ok(result.profileId && result.profileId.length > 0, 'expected a resolved profile id');
    console.log(`  ✓ profile ${result.profileId}`);

    // 4. NO data leak into the repo (src/data must stay absent).
    const srcData = path.resolve(process.cwd(), 'src', 'data');
    assert.equal(fs.existsSync(srcData), false, 'src/data should NOT be created (leak!)');

    // 5. Backend killed after stage (no lingering process footprint in our control).
    killBackend();

    // cleanup
    fs.rmSync(ws.root, { recursive: true, force: true });
});
