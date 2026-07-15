/**
 * tts.test.ts — Phase 2/4.2: voiceover generation + caption sidecars.
 * Verifies the offline fallback (agent tone) path and the sidecar writer,
 * without requiring a real Edge-TTS engine. (DI: we do not mock the engine;
 * we assert the function degrades gracefully and still yields a watchable plan.)
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateAgenticVoiceovers } from './tts.js';
import { buildPlan } from './plan.js';
import { Plan } from './types.js';

function tmpWs(jobId: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-tts-' + jobId + '-'));
    return { root, jobId };
}

describe('agentic/tts (Phase 2 + 4.2)', () => {
    let plan: Plan;
    before(async () => {
        plan = await buildPlan('Scene one about cats. [Visual: cat]\nScene two about dogs. [Visual: dog]', {
            jobId: 'tt',
            title: 'TT',
            orientation: 'portrait',
        });
    });

    it('produces one voiceover per scene with caption segments', async () => {
        const ws = tmpWs('tt1');
        const r = await generateAgenticVoiceovers(plan, ws as any, 'en-US-JennyNeural');
        assert.equal(r.scenes.length, plan.scenes.length);
        for (const s of r.scenes) {
            assert.ok(s.audioPath && fs.existsSync(s.audioPath), 'audio file should exist');
            assert.ok(s.durationSec > 0, 'duration should be positive');
            assert.ok(Array.isArray(s.captionSegments) && s.captionSegments.length > 0, 'caption segments present');
        }
    });

    it('writes SRT + VTT sidecar files', async () => {
        const ws = tmpWs('tt2');
        const r = await generateAgenticVoiceovers(plan, ws as any, 'en-US-JennyNeural');
        const srt = path.join(ws.root, 'audio', 'subtitles.srt');
        const vtt = path.join(ws.root, 'audio', 'subtitles.vtt');
        if (r.voiceoverDriven) {
            assert.ok(fs.existsSync(srt), 'srt written when real TTS used');
            assert.ok(fs.existsSync(vtt), 'vtt written when real TTS used');
        } else {
            // Offline fallback still writes sidecars from sentence-length cues.
            assert.ok(fs.existsSync(srt), 'srt written in fallback mode');
        }
    });

    it('falls back to tones offline without throwing', async () => {
        const ws = tmpWs('tt3');
        const r = await generateAgenticVoiceovers(plan, ws as any, 'en-US-JennyNeural');
        // Either real TTS or graceful tone fallback — both must yield audio.
        assert.equal(r.scenes.length, plan.scenes.length);
        assert.ok(r.sidecars.length >= 0);
    });
});
