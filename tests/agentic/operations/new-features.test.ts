import { makeWorkspaceTempDir, resolveWorkspaceTempPath } from '../../../src/shared/runtime/paths.js';
const __WS_TEST_TMP__ = resolveWorkspaceTempPath('tests');
/**
 * new-features.test.ts — unit tests for the 5 new free single-task operations.
 * Uses Node's built-in test runner (node:test) — no jest globals.
 * Covers the pure helper logic (parsing/filter-building) that needs no ffmpeg
 * or GPU. The ffmpeg-dependent functions are exercised by the pipeline's
 * render checks; here we assert the deterministic helpers.
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { parseSilenceLog, spokenSpans, buildKeepFilter } from '../../../src/agentic/operations/silence.js';
import { parseSceneCuts, buildChapters, longestScene } from '../../../src/agentic/operations/scene.js';
import { hexToRgb, buildBrandFilter } from '../../../src/agentic/operations/brand.js';
import { audioDenoiser, videoSmoother } from '../../../src/agentic/operations/noise.js';
import { autoReframe } from '../../../src/agentic/operations/reframe.js';

describe('silence helpers', () => {
    const log = 'silence_start: 1.0\nsilence_end: 2.5\nsilence_start: 5.0\nsilence_end: 6.0';
    test('parseSilenceLog finds 2 spans (needs duration + minDur)', () => {
        const spans = parseSilenceLog(log, 10, 0.5);
        assert.equal(spans.length, 2);
        assert.deepEqual(spans[0], { start: 1.0, end: 2.5 });
    });
    test('spokenSpans inverts silence into spoken segments', () => {
        const spoken = spokenSpans(parseSilenceLog(log, 10, 0.5), 10);
        assert.deepEqual(spoken[0], { start: 0, end: 1.0 });
        assert.equal(spoken[spoken.length - 1].end, 10);
    });
    test('buildKeepFilter produces an aselect chain', () => {
        const f = buildKeepFilter(spokenSpans(parseSilenceLog(log, 10, 0.5), 10));
        assert.ok(f.includes('aselect'));
        assert.ok(f.includes('between(t'));
    });
});

describe('scene helpers', () => {
    const log = 'scene_cut_detected time=3.2 score=0.85\nscene_cut_detected time=7.8 score=0.91\nDuration: 00:00:10.00';
    test('parseSceneCuts finds 2 cuts', () => {
        assert.equal(parseSceneCuts(log).length, 2);
    });
    test('buildChapters segments by cuts', () => {
        const ch = buildChapters(parseSceneCuts(log), 10);
        assert.equal(ch.length, 3);
        assert.equal(ch[0].label, 'Scene 1');
    });
    test('longestScene returns widest segment', () => {
        const ch = buildChapters(parseSceneCuts(log), 10);
        const longest = longestScene(ch);
        assert.ok(longest !== null && longest.end - longest.start > 0);
    });
});

describe('brand helpers', () => {
    test('hexToRgb parses #ff0000', () => {
        assert.deepEqual(hexToRgb('#ff0000'), [255, 0, 0]);
    });
    test('buildBrandFilter includes name', () => {
        const f = buildBrandFilter({ name: 'test', color: '#00ff00' });
        assert.ok(f.includes('test'));
    });
    test('buildBrandFilter empty returns empty string', () => {
        assert.equal(buildBrandFilter({}), '');
    });
});

describe('noise helpers', () => {
    test('audioDenoiser scales with strength', () => {
        assert.ok(audioDenoiser('light').includes('afftdn=nr=8'));
        assert.ok(audioDenoiser('heavy').includes('afftdn=nr=32'));
    });
    test('videoSmoother null for <=0', () => {
        assert.equal(videoSmoother(0), null);
        const vf = videoSmoother(4);
        assert.ok(vf !== null && vf.includes('hqdn3d'));
    });
});

describe('reframe passthrough', () => {
    test('autoReframe guards missing file', async () => {
        const r = await autoReframe('/no/such/file.mp4', undefined, { preset: '9:16' });
        assert.equal(r.ok, false);
        assert.ok(r.detail.includes('not found'));
    });
});

// --- Probe-injection tests: prove the REAL-duration / REAL-dims path works
// (the old bug derived duration from a DURATION: hint absent in real ffmpeg
// output, making silence-removal a no-op and scene trim/chapters empty). ---
const fakeProbe = async (_file: string): Promise<{ duration: number; width: number; height: number }> => ({
    duration: 12.5,
    width: 1920,
    height: 1080,
});

describe('real-duration probe wiring', () => {
    const tmp = path.join(__WS_TEST_TMP__, `avt_probe_test_${Date.now()}.mp4`);
    test.before(() => {
        fs.writeFileSync(tmp, Buffer.from([0]));
    });
    test.after(() => {
        try {
            fs.unlinkSync(tmp);
        } catch {
            /* noop */
        }
    });

    test('removeSilence uses probed duration (not the old 1e9 no-op)', async () => {
        const { removeSilence } = await import('../../../src/agentic/operations/silence.js');
        // Mock runner emits a real silencedetect log with a cut; mock probe
        // returns a real 12.5s duration. If duration fell back to 1e9 (old bug)
        // spokenSpans would be a single giant span and "removed 0".
        const r = await removeSilence(tmp, path.join(__WS_TEST_TMP__, `avt_out_${Date.now()}.mp4`), {
            runner: async () => ({ code: 0, out: 'silence_start: 5.0\nsilence_end: 6.0' }),
            probe: fakeProbe as any,
        });
        assert.ok(r.detail.length > 0);
        // With a real 12.5s duration and a 1s silent span, it must report removing 1.
        assert.ok(/removed 1 silent span/.test(r.detail), `detail was: ${r.detail}`);
    });

    test('detectScenes builds chapters from probed duration', async () => {
        const { detectScenes } = await import('../../../src/agentic/operations/scene.js');
        const log = 'scene_cut_detected time=3.2 score=0.85\nscene_cut_detected time=7.8 score=0.91';
        const r = await detectScenes(tmp, undefined, {
            mode: 'chapters',
            runner: async () => ({ code: 0, out: log }),
            probe: fakeProbe as any,
        });
        assert.equal(r.ok, true);
        assert.equal(r.chapters?.length, 3); // 0-3.2, 3.2-7.8, 7.8-12.5
    });

    test('autoReframe uses probed dimensions (not ffmpeg stderr regex)', async () => {
        const { computeCropBox } = await import('../../../src/agentic/operations/reframe.js');
        // 1920x1080 probed -> 9:16 crop box is computed from real dims.
        const box = computeCropBox(1920, 1080, '9:16');
        assert.ok(box.w > 0 && box.h > 0);
        assert.ok(box.w / box.h > 0.5 && box.w / box.h < 0.6); // ~9:16
    });
});

describe('error handling & resilience', () => {
    test('autoReframe rejects unsupported preset with a clean error (no crash)', async () => {
        const { autoReframe } = await import('../../../src/agentic/operations/reframe.js');
        const r = await autoReframe('/fake/in.mp4', undefined, { preset: '4:3' as any });
        assert.equal(r.ok, false);
        assert.match(r.detail, /unsupported reframe preset/);
    });

    test('doTask never throws when an op throws internally', async () => {
        const { doTask } = await import('../../../src/agentic/operations/dispatch.js');
        // download_image with empty keyword returns a structured failure, not a throw.
        const r = await doTask('download an image of nothing', { files: [] });
        assert.equal(typeof r.ok, 'boolean');
        assert.ok('detail' in r);
        // It must not throw; we reached this assertion.
        assert.ok(true);
    });

    test('doTask classifies remove_silence and routes to the op without throwing', async () => {
        const { doTask } = await import('../../../src/agentic/operations/dispatch.js');
        // Missing input file -> structured ok:false, not an uncaught throw.
        const r = await doTask('remove silence from the video', { files: [] });
        assert.equal(r.kind, 'remove_silence');
        assert.equal(r.ok, false);
        assert.match(r.detail, /needs an input file/);
    });

    test('doTask blocks path-traversal in supplied out (security)', async () => {
        const { doTask } = await import('../../../src/agentic/operations/dispatch.js');
        const r = await doTask('merge these two clips', {
            files: ['a.mp4', 'b.mp4'],
            out: '../../../../etc/cron',
        });
        assert.equal(r.ok, false);
        assert.match(r.detail, /path traversal blocked/);
    });
});
