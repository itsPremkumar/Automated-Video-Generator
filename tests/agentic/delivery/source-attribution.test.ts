/**
 * source-attribution.test.ts — regression for accurate media-source labels.
 * The agentic pipeline previously hardcoded source='pexels' regardless of the
 * real provider; sourceFromUrl derives it from the URL host. Offline, $0.
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { sourceFromUrl } from '../../../src/agentic/orchestrate.js';

describe('sourceFromUrl attribution', () => {
    test('identifies pexels', () => {
        assert.equal(sourceFromUrl('https://images.pexels.com/photos/1/coffee.jpg'), 'pexels');
    });
    test('identifies pixabay', () => {
        assert.equal(sourceFromUrl('https://cdn.pixabay.com/video/foo.mp4'), 'pixabay');
    });
    test('identifies wikimedia commons', () => {
        assert.equal(sourceFromUrl('https://upload.wikimedia.org/wikipedia/commons/a/b/clip.webm'), 'wikimedia');
    });
    test('identifies internet archive', () => {
        assert.equal(sourceFromUrl('https://archive.org/download/xyz/xyz.mp4'), 'internet-archive');
    });
    test('identifies openverse', () => {
        assert.equal(sourceFromUrl('https://api.openverse.engineering/v1/images/abc'), 'openverse');
    });
    test('returns unknown on garbage', () => {
        assert.equal(sourceFromUrl('not-a-url'), 'unknown');
    });
    test('labels unrecognized hosts by their real domain (flickr filtered upstream)', () => {
        // flickr is a dead/flaky host in this env and is rejected by the caller
        // before attribution; sourceFromUrl still labels it by its real domain.
        assert.equal(sourceFromUrl('https://live.staticflickr.com/1/2.jpg'), 'live.staticflickr.com');
    });
});
