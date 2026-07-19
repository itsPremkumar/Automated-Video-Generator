import assert from 'node:assert/strict';
import test from 'node:test';
import {
    searchAllImagePlatforms,
    searchAllVideoPlatforms,
    downloadOneAsset,
} from './media-downloader.js';

/**
 * OFFLINE tests for the parallel multi-platform downloader. Every provider is
 * monkeypatched on its PROTOTYPE so the search functions (which construct their
 * own adapter instances) use fake data — no real network, no 429 hangs. These
 * prove the fault-isolation + relevance-filter architecture without ffmpeg.
 */
const patch = (mod: any, name: string, fn: any) => {
    const cls = mod[name];
    const orig = cls.prototype.search;
    cls.prototype.search = fn;
    return () => { cls.prototype.search = orig; };
};
const fakeImg = (titles: string[], source: string) =>
    titles.map((title, i) => ({ id: `${source}-${i}`, title, creator: 't', license: 'PD', licenseUrl: '', provider: source, downloadUrl: `https://${source}.example/${i}.jpg`, thumbnailUrl: null, width: 800, height: 600, fileSizeBytes: 1, sourcePageUrl: '' }));
const fakeVid = (titles: string[], source: string) =>
    titles.map((title, i) => ({ id: `${source}-${i}`, title, creator: 't', license: 'PD', licenseUrl: '', provider: source, downloadUrl: `https://${source}.example/${i}.mp4`, thumbnailUrl: null, durationSeconds: 10, resolution: '1920x1080', fileSizeBytes: 1, format: 'mp4' as const, sourcePageUrl: '' }));

test('OFFLINE: image platform isolation — a throwing provider yields [] not crash', async () => {
    const wik = await import('./free-image/providers/wikimedia.js');
    const arc = await import('./free-image/providers/archive.js');
    const nasa = await import('./free-image/providers/nasa.js');
    const met = await import('./free-image/providers/metmuseum.js');
    const r1 = patch(wik, 'WikimediaImageProvider', async () => fakeImg(['Lion in savanna', 'Lion cub'], 'wiki'));
    const r2 = patch(arc, 'ArchiveOrgImageProvider', async () => { throw new Error('network down'); });
    const r3 = patch(nasa, 'NasaImageProvider', async () => fakeImg(['Lion nebula (space, OFF-TOPIC)'], 'nasa'));
    const r4 = patch(met, 'MetMuseumImageProvider', async () => fakeImg(['Lion tapestry (art, OFF-TOPIC)'], 'met'));

    const hits = await searchAllImagePlatforms('lion', 6);
    r1(); r2(); r3(); r4();
    // NASA/MET are gated off for "lion"; archive threw but was isolated.
    assert.ok(hits.length >= 1, 'wikimedia results survived despite archive throwing');
    assert.ok(hits.every((h) => /lion/i.test(h.title) && !/nebula|tapestry/i.test(h.title)), 'only on-topic, no off-topic');
});

test('OFFLINE: video platform isolation + relevance', async () => {
    const wik = await import('./free-video/providers/wikimedia.js');
    const arc = await import('./free-video/providers/archive.js');
    const r1 = patch(wik, 'WikimediaProvider', async () => fakeVid(['African Lion clip', 'Lion King trailer (OFF)'], 'wiki'));
    const r2 = patch(arc, 'ArchiveOrgProvider', async () => fakeVid(['ライオン ナテラ CM (OFF brand)', 'Male lion roaring'], 'archive'));

    const hits = await searchAllVideoPlatforms('lion', 6);
    r1(); r2();
    assert.ok(hits.some((h) => /lion/i.test(h.title) && !/king|ナテラ|brand/i.test(h.title)), 'real lion video present');
    assert.ok(!hits.some((h) => /king|ナテラ/i.test(h.title)), 'off-topic (lion king / japanese brand) filtered');
});

test('OFFLINE: downloadOneAsset never throws — reports ok:false on bad URL', async () => {
    const hit = { source: 'wiki', title: 'x', url: 'data:image/png;base64,xxx', kind: 'image' as const };
    const res = await downloadOneAsset(hit, process.cwd());
    assert.equal(res.ok, false, 'failed download is reported, not thrown');
    assert.ok(res.reason.length > 0);
});
