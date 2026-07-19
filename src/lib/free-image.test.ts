import assert from 'node:assert/strict';
import test from 'node:test';
import { WikimediaImageProvider } from './free-image/providers/wikimedia.js';
import { ArchiveOrgImageProvider } from './free-image/providers/archive.js';
import { NasaImageProvider } from './free-image/providers/nasa.js';
import { MetMuseumImageProvider } from './free-image/providers/metmuseum.js';
import { FreeImageAdapter } from './free-image/adapter.js';

const axios = require('axios');

/**
 * Quick ping — if the provider's host is unreachable the test skips instead
 * of timing out after the global 60s node:test timeout.
 *
 * In CI environments external hosts are often blocked or rate-limited, so we
 * skip proactively rather than waiting for a 30s+ timeout on the actual API call.
 *
 * @param url       The host URL to probe
 * @param ctx       The node:test context (t)
 * @param timeoutMs HEAD probe timeout in ms (default 3000)
 */
async function skipIfUnreachable(url: string, ctx: any, timeoutMs = 3000): Promise<void> {
    // CI environments often block or rate-limit external hosts.
    // Skip rather than wait for a 30s+ timeout on the actual API call.
    if (process.env.CI === 'true') {
        ctx.skip(`CI env: skipping test for ${url}`);
        // ctx.skip() marks the test as skipped but does NOT abort execution.
        // We must throw to prevent the test body from continuing to run.
        throw new Error(`CI env: skipping test for ${url}`);
    }
    try {
        await axios.head(url, { timeout: timeoutMs });
    } catch {
        ctx.skip(`host unreachable: ${url}`);
        throw new Error(`host unreachable: ${url}`);
    }
}

test('WikimediaImageProvider returns results for "city"', async (t) => {
    await skipIfUnreachable('https://commons.wikimedia.org', t);
    const provider = new WikimediaImageProvider();
    const results = await provider.search({ keyword: 'city', count: 3 });
    assert.ok(results.length > 0, 'should return at least one image for "city"');
    for (const r of results) {
        assert.ok(r.downloadUrl.startsWith('http'), `downloadUrl should be a URL: ${r.downloadUrl}`);
        assert.ok(r.license.length > 0, 'license should not be empty');
        assert.ok(r.provider === 'wikimedia-commons');
    }
});

test('WikimediaImageProvider respects count limit', async (t) => {
    await skipIfUnreachable('https://commons.wikimedia.org', t);
    const provider = new WikimediaImageProvider();
    const results = await provider.search({ keyword: 'city skyline', count: 5 });
    assert.ok(results.length <= 5, 'should not exceed requested count');
});

test('WikimediaImageProvider returns empty for impossible keyword', async (t) => {
    await skipIfUnreachable('https://commons.wikimedia.org', t);
    const provider = new WikimediaImageProvider();
    const results = await provider.search({ keyword: 'xyznonexistentkeyword12345', count: 3 });
    assert.ok(results.length === 0, 'should return empty array');
});

test('ArchiveOrgImageProvider returns results for "sunset"', async (t) => {
    await skipIfUnreachable('https://archive.org', t);
    const provider = new ArchiveOrgImageProvider();
    const results = await provider.search({ keyword: 'sunset', count: 2, minWidth: 200, minHeight: 200 });
    assert.ok(results.length > 0, 'should return at least one image');
    for (const r of results) {
        assert.ok(r.downloadUrl.startsWith('http'), `downloadUrl should be a URL: ${r.downloadUrl}`);
        assert.ok(r.provider === 'internet-archive');
    }
});

test('ArchiveOrgImageProvider respects orientation filter', async (t) => {
    await skipIfUnreachable('https://archive.org', t);
    const provider = new ArchiveOrgImageProvider();
    const results = await provider.search({ keyword: 'portrait photography', count: 3, orientation: 'portrait' });
    assert.ok(results.length >= 0, 'should handle orientation filter');
    if (results.length > 0) {
        for (const r of results) {
            if (r.width && r.height) {
                assert.ok(r.width / r.height < 1.1, 'should be roughly portrait');
            }
        }
    }
});

test('NasaImageProvider returns results for "nebula"', async (t) => {
    await skipIfUnreachable('https://images-api.nasa.gov', t);
    const provider = new NasaImageProvider();
    const results = await provider.search({ keyword: 'nebula', count: 3 });
    assert.ok(results.length > 0, 'should return at least one image');
    for (const r of results) {
        assert.ok(r.downloadUrl.startsWith('http'), `downloadUrl should be a URL: ${r.downloadUrl}`);
        assert.ok(r.license.includes('Public Domain'), 'NASA images should be public domain');
        assert.ok(r.provider === 'nasa');
    }
});

test('NasaImageProvider returns results for "mars rover"', async (t) => {
    await skipIfUnreachable('https://images-api.nasa.gov', t);
    const provider = new NasaImageProvider();
    const results = await provider.search({ keyword: 'mars rover', count: 2 });
    assert.ok(results.length > 0, 'should return at least one image');
});

test('MetMuseumImageProvider returns results for "sunflowers"', async (t) => {
    await skipIfUnreachable('https://collectionapi.metmuseum.org', t);
    const provider = new MetMuseumImageProvider();
    const results = await provider.search({ keyword: 'sunflowers', count: 2 });
    assert.ok(results.length > 0, 'should return at least one image');
    for (const r of results) {
        assert.ok(r.downloadUrl.startsWith('http'), `downloadUrl should be a URL: ${r.downloadUrl}`);
        assert.ok(r.provider === 'metmuseum');
    }
});

test('MetMuseumImageProvider returns results for "landscape painting"', async (t) => {
    await skipIfUnreachable('https://collectionapi.metmuseum.org', t);
    const provider = new MetMuseumImageProvider();
    const results = await provider.search({ keyword: 'landscape painting', count: 3 });
    assert.ok(results.length >= 0, 'should handle search gracefully');
});

test('FreeImageAdapter.searchAll aggregates from all providers', async (t) => {
    await skipIfUnreachable('https://commons.wikimedia.org', t);
    const adapter = new FreeImageAdapter();
    const sources = await adapter.searchAll('waterfall', { count: 2 });
    assert.ok(sources.length > 0, 'should find images from at least one provider');
    for (const s of sources) {
        assert.ok(s.results.length > 0, `${s.source} should have results`);
    }
});

test('FreeImageAdapter.searchBest returns highest resolution image', async (t) => {
    await skipIfUnreachable('https://commons.wikimedia.org', t);
    const adapter = new FreeImageAdapter();
    const best = await adapter.searchBest('aurora borealis', { count: 3 });
    assert.ok(best !== null, 'should find a best image');
    assert.ok(best.downloadUrl.startsWith('http'), 'downloadUrl should be a URL');
    assert.ok(best.license.length > 0, 'license should exist');
});

// ---------------------------------------------------------------------------
// OFFLINE relevance tests — these DO NOT touch the network and always run
// (including in CI). They prove the "wrong image / wrong video" fix: a generic
// query like "lion" must never surface off-topic NASA space photos, MetMuseum
// art ("sea lion"/"Lion King"), or "stone lion" statues, and must rank a real
// lion photo first.
// ---------------------------------------------------------------------------
function fakeResults(titles: string[]) {
    return titles.map((title, i) => ({
        id: `fake-${i}`,
        title,
        creator: 'tester',
        license: 'PD',
        licenseUrl: '',
        provider: 'fake',
        downloadUrl: `https://example.com/${i}.jpg`,
        thumbnailUrl: null,
        width: 1920,
        height: 1080,
        fileSizeBytes: 1000,
        sourcePageUrl: '',
    }));
}

test('OFFLINE: "lion" excludes NASA space photos and MetMuseum art', async () => {
    const adapter = new FreeImageAdapter() as any;
    adapter.wiki = {
        name: 'wikimedia',
        search: async () =>
            fakeResults(['Lion (Panthera leo) resting', 'Lioness with cubs', 'Stone lion statue (off-topic)']),
    };
    adapter.archive = {
        name: 'archive',
        search: async () => fakeResults(['Male lion portrait', 'Lion King cartoon poster (off-topic)']),
    };
    // NASA/MET must NOT be queried for a generic "lion" query:
    adapter.nasa = {
        name: 'nasa',
        search: async () => {
            throw new Error('NASA must NOT be queried for "lion"');
        },
    };
    adapter.met = {
        name: 'met',
        search: async () => {
            throw new Error('MetMuseum must NOT be queried for "lion"');
        },
    };

    const all = await adapter.searchAll('lion', { count: 10 });
    const sources = all.map((s: any) => s.source);
    assert.ok(!sources.includes('nasa'), 'NASA excluded for generic "lion"');
    assert.ok(!sources.includes('metmuseum'), 'MetMuseum excluded for generic "lion"');

    const titles = all.flatMap((s: any) => s.results.map((r: any) => r.title));
    assert.ok(
        !titles.some((t: string) => /stone lion|lion king/i.test(t)),
        'off-topic stone-lion/Lion-King filtered out',
    );
    assert.ok(
        titles.some((t: string) => /lion/i.test(t)),
        'on-topic lion assets present',
    );
});

test('OFFLINE: "lion" searchBest ranks a REAL lion photo first', async () => {
    const adapter = new FreeImageAdapter() as any;
    adapter.wiki = {
        name: 'wikimedia',
        search: async () => fakeResults(['Lion (Panthera leo) resting', 'Stone lion statue (off-topic)']),
    };
    adapter.archive = {
        name: 'archive',
        search: async () => fakeResults(['Male lion portrait', 'Lion King cartoon poster (off-topic)']),
    };
    adapter.nasa = {
        name: 'nasa',
        search: async () => fakeResults(['Lion nebula in infrared (OFF-TOPIC space photo)']),
    };
    adapter.met = { name: 'met', search: async () => fakeResults(['Sea lion sculpture (OFF-TOPIC art)']) };

    const best = await adapter.searchBest('lion', { count: 10 });
    assert.ok(best !== null, 'should return a result');
    assert.ok(
        /lion/i.test(best.title) && !/nebula|stone lion|lion king|sea lion/i.test(best.title),
        `top hit must be on-topic lion, got: "${best.title}"`,
    );
});

test('OFFLINE: space query still includes NASA', async () => {
    const adapter = new FreeImageAdapter() as any;
    adapter.wiki = { name: 'wikimedia', search: async () => [] };
    adapter.archive = { name: 'archive', search: async () => [] };
    adapter.nasa = { name: 'nasa', search: async () => fakeResults(['Lion nebula in infrared', 'Spiral galaxy']) };
    adapter.met = { name: 'met', search: async () => [] };

    const all = await adapter.searchAll('galaxy nebula', { count: 10 });
    assert.ok(
        all.some((s: any) => s.source === 'nasa'),
        'NASA INCLUDED for space query',
    );
});
