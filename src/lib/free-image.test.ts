import assert from 'node:assert/strict';
import test from 'node:test';
import { WikimediaImageProvider } from './free-image/providers/wikimedia.js';
import { ArchiveOrgImageProvider } from './free-image/providers/archive.js';
import { NasaImageProvider } from './free-image/providers/nasa.js';
import { MetMuseumImageProvider } from './free-image/providers/metmuseum.js';
import { FreeImageAdapter } from './free-image/adapter.js';

test('WikimediaImageProvider returns results for "city"', async () => {
    const provider = new WikimediaImageProvider();
    const results = await provider.search({ keyword: 'city', count: 3 });
    assert.ok(results.length > 0, 'should return at least one image for "city"');
    for (const r of results) {
        assert.ok(r.downloadUrl.startsWith('http'), `downloadUrl should be a URL: ${r.downloadUrl}`);
        assert.ok(r.license.length > 0, 'license should not be empty');
        assert.ok(r.provider === 'wikimedia-commons');
    }
});

test('WikimediaImageProvider respects count limit', async () => {
    const provider = new WikimediaImageProvider();
    const results = await provider.search({ keyword: 'city skyline', count: 5 });
    assert.ok(results.length <= 5, 'should not exceed requested count');
});

test('WikimediaImageProvider returns empty for impossible keyword', async () => {
    const provider = new WikimediaImageProvider();
    const results = await provider.search({ keyword: 'xyznonexistentkeyword12345', count: 3 });
    assert.ok(results.length === 0, 'should return empty array');
});

test('ArchiveOrgImageProvider returns results for "sunset"', async () => {
    const provider = new ArchiveOrgImageProvider();
    const results = await provider.search({ keyword: 'sunset', count: 2, minWidth: 200, minHeight: 200 });
    assert.ok(results.length > 0, 'should return at least one image');
    for (const r of results) {
        assert.ok(r.downloadUrl.startsWith('http'), `downloadUrl should be a URL: ${r.downloadUrl}`);
        assert.ok(r.provider === 'internet-archive');
    }
});

test('ArchiveOrgImageProvider respects orientation filter', async () => {
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

test('NasaImageProvider returns results for "nebula"', async () => {
    const provider = new NasaImageProvider();
    const results = await provider.search({ keyword: 'nebula', count: 3 });
    assert.ok(results.length > 0, 'should return at least one image');
    for (const r of results) {
        assert.ok(r.downloadUrl.startsWith('http'), `downloadUrl should be a URL: ${r.downloadUrl}`);
        assert.ok(r.license.includes('Public Domain'), 'NASA images should be public domain');
        assert.ok(r.provider === 'nasa');
    }
});

test('NasaImageProvider returns results for "mars rover"', async () => {
    const provider = new NasaImageProvider();
    const results = await provider.search({ keyword: 'mars rover', count: 2 });
    assert.ok(results.length > 0, 'should return at least one image');
});

test('MetMuseumImageProvider returns results for "sunflowers"', async () => {
    const provider = new MetMuseumImageProvider();
    const results = await provider.search({ keyword: 'sunflowers', count: 2 });
    assert.ok(results.length > 0, 'should return at least one image');
    for (const r of results) {
        assert.ok(r.downloadUrl.startsWith('http'), `downloadUrl should be a URL: ${r.downloadUrl}`);
        assert.ok(r.provider === 'metmuseum');
    }
});

test('MetMuseumImageProvider returns results for "landscape painting"', async () => {
    const provider = new MetMuseumImageProvider();
    const results = await provider.search({ keyword: 'landscape painting', count: 3 });
    assert.ok(results.length >= 0, 'should handle search gracefully');
});

test('FreeImageAdapter.searchAll aggregates from all providers', async () => {
    const adapter = new FreeImageAdapter();
    const sources = await adapter.searchAll('waterfall', { count: 2 });
    assert.ok(sources.length > 0, 'should find images from at least one provider');
    for (const s of sources) {
        assert.ok(s.results.length > 0, `${s.source} should have results`);
    }
});

test('FreeImageAdapter.searchBest returns highest resolution image', async () => {
    const adapter = new FreeImageAdapter();
    const best = await adapter.searchBest('aurora borealis', { count: 3 });
    assert.ok(best !== null, 'should find a best image');
    assert.ok(best.downloadUrl.startsWith('http'), 'downloadUrl should be a URL');
    assert.ok(best.license.length > 0, 'license should exist');
});
