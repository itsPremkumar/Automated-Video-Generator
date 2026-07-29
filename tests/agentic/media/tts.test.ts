import { makeWorkspaceTempDir, resolveWorkspaceTempPath } from '../../../src/shared/runtime/paths.js';
const __WS_TEST_TMP__ = resolveWorkspaceTempPath('tests');
/**
 * tts.test.ts — Phase 2/4.2: voiceover generation + caption sidecars.
 * Verifies the offline fallback (agent tone) path and the sidecar writer,
 * without requiring a real Edge-TTS engine. (DI: we do not mock the engine;
 * we assert the function degrades gracefully and still yields a watchable plan.)
 *
 * SINGLE-GENERATION pattern: call generateAgenticVoiceovers ONCE per describe
 * block (not per assertion), because each call starts AND kills the vendored
 * speech backend (runVoiceStageSafe → killBackend). On a RAM-constrained
 * machine (~800 MB free) a cold backend restart after kill can take >90s,
 * which would blow the 120s file-level suite timeout when split across
 * multiple tests. One generation + all assertions on the single result
 * matches the production pattern (one generate call per video).
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { generateAgenticVoiceovers } from '../../../src/agentic/media/tts.js';
import { buildPlan } from '../../../src/agentic/pipeline/plan.js';
import { Plan } from '../../../src/agentic/types.js';

function tmpWs(jobId: string) {
    const root = fs.mkdtempSync(path.join(__WS_TEST_TMP__, 'agentic-tts-' + jobId + '-'));
    return { root, jobId };
}

describe('agentic/tts (Phase 2 + 4.2)', () => {
    let plan: Plan;
    let result: Awaited<ReturnType<typeof generateAgenticVoiceovers>>;

    before(async () => {
        plan = await buildPlan('Scene one about cats. [Visual: cat]\nScene two about dogs. [Visual: dog]', {
            jobId: 'tt',
            title: 'TT',
            orientation: 'portrait',
        });
        // Generate voiceovers ONCE in before() so the backend is started and
        // killed exactly once. All subsequent assertions reuse this result,
        // avoiding a second cold backend start that would exceed the suite's
        // 120s file-level timeout on RAM-constrained CI/VMs.
        const ws = tmpWs('tt');
        result = await generateAgenticVoiceovers(plan, ws as any, 'en-US-JennyNeural');
    });

    it('produces one voiceover per scene with caption segments + sidecars', () => {
        assert.equal(result.scenes.length, plan.scenes.length);
        for (const s of result.scenes) {
            assert.ok(s.audioPath && fs.existsSync(s.audioPath), 'audio file should exist');
            assert.ok(s.durationSec > 0, 'duration should be positive');
            assert.ok(Array.isArray(s.captionSegments) && s.captionSegments.length > 0, 'caption segments present');
        }
        // Sidecars — SRT + VTT when real TTS is used, at least SRT in fallback
        const ws = { root: result.scenes[0].audioPath };
        const audioDir = path.dirname(result.scenes[0].audioPath);
        const srt = path.join(audioDir, 'subtitles.srt');
        const vtt = path.join(audioDir, 'subtitles.vtt');
        if (result.voiceoverDriven) {
            assert.ok(fs.existsSync(srt), 'srt written when real TTS used');
            assert.ok(fs.existsSync(vtt), 'vtt written when real TTS used');
        } else {
            assert.ok(fs.existsSync(srt), 'srt written in fallback mode');
        }
        assert.ok(result.sidecars.length > 0, 'at least one sidecar written');
    });

    it('yields audio for all scenes (real TTS or graceful tone fallback)', () => {
        // Either real TTS or graceful tone fallback — both must yield audio.
        assert.equal(result.scenes.length, plan.scenes.length);
        assert.ok(result.scenes.every(s => fs.existsSync(s.audioPath)), 'every scene has audio');
        assert.ok(result.sidecars.length >= 0);
    });
});
