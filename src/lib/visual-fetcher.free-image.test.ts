/**
 * visual-fetcher.free-image.test.ts — verify the free-image ladder integration
 * (Integration #2). Tests the searchFreeImages mapping without network by
 * stubbing freeImageAdapter.searchAll on the real adapter instance.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as proxy from './visual-fetcher.js';

test('searchFreeImages maps ImageResult -> MediaAsset and is network-safe', async () => {
    const adapter = (proxy as any).freeImageAdapter;
    const orig = adapter.searchAll.bind(adapter);
    adapter.searchAll = async () => [
        {
            source: 'wikimedia',
            results: [
                {
                    downloadUrl: 'http://x/a.jpg',
                    thumbnailUrl: 'http://x/a_t.jpg',
                    width: 1920,
                    height: 1080,
                    creator: 'Alice',
                    provider: 'wikimedia',
                },
            ],
        },
        {
            source: 'nasa',
            results: [{ downloadUrl: 'http://x/b.jpg', width: null, height: null, creator: 'NASA', provider: 'nasa' }],
        },
    ];
    try {
        const out = await (proxy as any).searchFreeImages('space', 3, 'portrait');
        assert.equal(out.length, 2);
        assert.equal(out[0].type, 'image');
        assert.equal(out[0].url, 'http://x/a.jpg');
        assert.equal(out[0].width, 1920);
        assert.equal(out[0].photographer, 'Alice');
        assert.equal(out[1].width, 0); // null dims coerced to 0
    } finally {
        adapter.searchAll = orig;
    }
});

test('searchFreeImages returns [] on adapter failure (safe, no throw)', async () => {
    const adapter = (proxy as any).freeImageAdapter;
    const orig = adapter.searchAll.bind(adapter);
    adapter.searchAll = async () => {
        throw new Error('net down');
    };
    try {
        const out = await (proxy as any).searchFreeImages('anything', 3);
        assert.deepEqual(out, []);
    } finally {
        adapter.searchAll = orig;
    }
});
