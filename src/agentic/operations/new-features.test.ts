/**
 * new-features.test.ts — unit tests for the 5 new free single-task operations.
 * Uses Node's built-in test runner (node:test) — no jest globals.
 * Covers the pure helper logic (parsing/filter-building) that needs no ffmpeg
 * or GPU. The ffmpeg-dependent functions are exercised by the pipeline's
 * render checks; here we assert the deterministic helpers.
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseSilenceLog, spokenSpans, buildKeepFilter } from './silence.js';
import { parseSceneCuts, buildChapters, longestScene } from './scene.js';
import { hexToRgb, buildBrandFilter } from './brand.js';
import { audioDenoiser, videoSmoother } from './noise.js';
import { autoReframe } from './reframe.js';

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
        assert.ok(longest !== null && (longest.end - longest.start) > 0);
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
