import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import { searchOpenverseImages } from './openverse-fetcher';
import type { MediaAsset } from './visual-fetcher';

// Openverse returns a paginated `results` array. We stub axios.get so the
// test never touches the network and stays deterministic + CI-friendly.
const realGet = axios.get;
const stubGet = (impl: (url: string, cfg: any) => any) => {
    (axios.get as unknown) = (url: string, cfg: any) => Promise.resolve(impl(url, cfg));
};
const restoreGet = () => {
    (axios.get as unknown) = realGet;
};

const sampleResults = [
    {
        id: 'img-1',
        title: 'Sunset over mountains',
        url: 'https://example.com/sunset.jpg',
        thumbnail: 'https://example.com/sunset_thumb.jpg',
        creator: 'Jane Photographer',
        license: 'CC0',
        license_version: '1.0',
        license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution: 'Jane Photographer',
        width: 4000,
        height: 3000,
    },
    {
        id: 'img-2',
        title: 'City skyline at night',
        url: 'https://example.com/city.jpg',
        thumbnail: 'https://example.com/city_thumb.jpg',
        creator: '',
        license: 'BY',
        license_version: '4.0',
        license_url: 'https://creativecommons.org/licenses/by/4.0/',
        attribution: 'Unknown',
        width: 1920,
        height: 1080,
    },
];

test.afterEach(() => restoreGet());

test('searchOpenverseImages maps Openverse results to MediaAsset[]', async () => {
    stubGet((_url, _cfg) => ({
        data: { result_count: sampleResults.length, results: sampleResults },
    }));

    const assets = await searchOpenverseImages('sunset', 5);

    assert.equal(assets.length, 2);
    assert.deepEqual(assets[0], {
        type: 'image',
        url: 'https://example.com/sunset.jpg',
        width: 4000,
        height: 3000,
        photographer: 'Jane Photographer',
    });
    // Empty creator must map to undefined, not an empty string.
    assert.equal(assets[1].photographer, undefined);
    assert.equal(assets[1].url, 'https://example.com/city.jpg');
});

test('searchOpenverseImages calls the Openverse images endpoint with page_size=min(count,50)', async () => {
    let captured: { url: string; page_size?: number; q?: string } = { url: '' };
    stubGet((url, cfg) => {
        captured = { url, ...(cfg?.params ?? {}) };
        return { data: { result_count: 0, results: [] } };
    });

    await searchOpenverseImages('nature', 12);

    assert.match(captured.url, /api\.openverse\.engineering\/v1\/images\/?$/);
    assert.equal(captured.q, 'nature');
    assert.equal(captured.page_size, 12);

    // A request for more than 50 must be clamped to 50.
    await searchOpenverseImages('ocean', 200);
    assert.equal(captured.page_size, 50);
});

test('searchOpenverseImages returns [] when the API returns no results', async () => {
    stubGet((_url, _cfg) => ({ data: { result_count: 0, results: [] } }));

    const assets = await searchOpenverseImages('nonexistent-thing', 5);

    assert.ok(Array.isArray(assets));
    assert.equal(assets.length, 0);
});

test('searchOpenverseImages propagates axios errors (network/HTTP failure)', async () => {
    stubGet(() => {
        const err = new Error('Request failed') as any;
        err.code = 'ECONNREFUSED';
        return Promise.reject(err);
    });

    await assert.rejects(() => searchOpenverseImages('sunset', 5), /ECONNREFUSED|Request failed/);
});

// Guard: ensure the MediaAsset shape we depend on stays compatible.
test('MediaAsset image shape is preserved (regression guard)', async () => {
    stubGet(() => ({ data: { result_count: 1, results: [sampleResults[0]] } }));
    const assets = await searchOpenverseImages('sunset', 1);
    const a: MediaAsset = assets[0];
    assert.equal(a.type, 'image');
    assert.equal(typeof a.url, 'string');
});
