/**
 * export.test.ts — verify the FREE post-production features (offline, $0):
 * multi-aspect export, free metadata, word-timings, thumbnail.
 * Uses node:test to match the repo convention.
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { exportMultiAspect, generateFreeMetadata, wordTimingsFromScript, ASPECT_DIMS } from './export.js';
import { Plan } from './types.js';

function mkPlan(): Plan {
    return {
        jobId: 't',
        title: '5 Coffee Facts',
        orientation: 'portrait',
        voice: 'en-US',
        musicQuery: 'ambient',
        scenes: [
            { sceneNumber: 1, voiceoverText: 'Coffee is the best drink ever made by humans', searchKeywords: ['coffee', 'beans'], visualPreference: 'image', durationSec: 4 },
            { sceneNumber: 2, voiceoverText: 'It improves focus and mood naturally', searchKeywords: ['focus', 'energy'], visualPreference: 'image', durationSec: 4 },
        ],
        totalDurationSec: 8,
    };
}

describe('free export features (offline)', () => {
    test('generateFreeMetadata builds title/description/hashtags with no LLM', () => {
        const m = generateFreeMetadata(mkPlan());
        assert.equal(m.title, '5 Coffee Facts');
        assert.match(m.description, /Coffee is the best/);
        assert.match(m.hashtags, /#coffee/);
        assert.ok(m.tags.includes('coffee'));
    });

    test('wordTimingsFromScript splits words evenly across duration', () => {
        const w = wordTimingsFromScript('one two three', 3);
        assert.equal(w.length, 3);
        assert.equal(w[0].startMs, 0);
        assert.equal(w[2].endMs, 3000);
        // contiguous
        assert.equal(w[0].endMs, w[1].startMs);
    });

    test('wordTimingsFromScript handles empty text', () => {
        assert.deepEqual(wordTimingsFromScript('', 4), []);
    });

    test('ASPECT_DIMS has correct dimensions', () => {
        assert.deepEqual(ASPECT_DIMS['9:16'], { w: 720, h: 1280 });
        assert.deepEqual(ASPECT_DIMS['16:9'], { w: 1280, h: 720 });
        assert.deepEqual(ASPECT_DIMS['1:1'], { w: 1080, h: 1080 });
    });

    test('exportMultiAspect returns [] when source missing (safe, no throw)', async () => {
        const out = await exportMultiAspect('/nonexistent/file.mp4', ['9:16']);
        assert.deepEqual(out, []);
    });
});
