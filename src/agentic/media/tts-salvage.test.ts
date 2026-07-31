import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'child_process';
import { salvageVoiceFiles } from './tts.js';

// ─────────────────────────────────────────────────────────────────────────────
// Regression for BUG #3 (2026-07-31): the voice-GROUP timeout (25s) raced the
// Windows SAPI fallback (up to 120s/scene). When the group promise rejected,
// every completed scene's REAL speech was discarded and the whole video got
// 220Hz sine-tone placeholders (peak -34.5 dB, no spoken voiceover) even
// though speech existed on disk. salvageVoiceFiles recovers those files.
// ─────────────────────────────────────────────────────────────────────────────

const ff: string = require('ffmpeg-static');
const TMP = path.resolve('workspace', 'tmp', 'tts-salvage-test');

test('salvageVoiceFiles recovers real speech orphaned by a voice-group timeout', () => {
    fs.mkdirSync(TMP, { recursive: true });
    try {
        // Real speech-equivalent audio: >16KB WAV and MP3 (both above threshold).
        execFileSync(ff, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=1', '-c:a', 'pcm_s16le', path.join(TMP, 'scene_1_voice.wav')], { stdio: 'ignore' });
        execFileSync(ff, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=1', '-c:a', 'libmp3lame', '-b:a', '128k', path.join(TMP, 'scene_2_voice.mp3')], { stdio: 'ignore' });
        // Tiny/junk file below the 16KB floor — must NOT be salvaged.
        fs.writeFileSync(path.join(TMP, 'scene_3_voice.wav'), Buffer.alloc(100, 1));
        // Silent-track fallback filename — must NOT be salvaged (wrong name).
        fs.writeFileSync(path.join(TMP, 'scene_4_voice_silent.wav'), Buffer.alloc(50000, 1));
        const scenes = [1, 2, 3, 4, 5].map((n) => ({ sceneNumber: n, durationSec: 4 }));
        const got = salvageVoiceFiles(TMP, scenes);
        assert.equal(got.size, 2, `only scenes 1 & 2 have real speech (got ${got.size})`);
        assert.ok(got.has(1) && got.get(1)!.path.endsWith('scene_1_voice.wav'));
        assert.ok(got.has(2) && got.get(2)!.path.endsWith('scene_2_voice.mp3'));
        assert.ok(!got.has(3), 'tiny/junk file must be skipped');
        assert.ok(!got.has(4), 'silent-track filename must be skipped');
        assert.ok(!got.has(5), 'missing scene must not be salvaged');
        assert.ok(got.get(1)!.duration >= 1, `duration should be probed from the real file (got ${got.get(1)!.duration})`);
    } finally {
        fs.rmSync(TMP, { recursive: true, force: true });
    }
});
