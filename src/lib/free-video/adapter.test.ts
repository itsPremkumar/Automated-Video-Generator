import assert from 'node:assert/strict';
import test from 'node:test';
import { FreeVideoAdapter } from './adapter.js';

/**
 * OFFLINE relevance tests for the VIDEO download path. These prove the
 * "wrong video" bug is fixed: a generic query like "lion" must never surface
 * off-topic clips ("lion king" trailer, "lion dance", "sea lion") and must
 * rank a real lion clip first. No network — providers are monkeypatched.
 */
function fakeVideos(titles: string[]) {
    return titles.map((title, i) => ({
        id: `fake-${i}`,
        title,
        creator: 'tester',
        license: 'PD',
        licenseUrl: '',
        provider: 'fake',
        downloadUrl: `https://example.com/${i}.mp4`,
        thumbnailUrl: null,
        durationSeconds: 10,
        resolution: '1920x1080',
        fileSizeBytes: 5000000,
        format: 'mp4',
        sourcePageUrl: '',
    }));
}

test('OFFLINE video: "lion" drops off-topic clips (lion king / sea lion / lion dance)', async () => {
    const adapter = new FreeVideoAdapter() as any;
    adapter.wiki = {
        name: 'wikimedia',
        search: async () =>
            fakeVideos([
                'Lion resting in savannah',
                'Lioness hunting',
                'Lion King trailer (OFF-TOPIC)',
                'Lion dance festival (OFF-TOPIC)',
            ]),
    };
    adapter.archive = {
        name: 'archive',
        search: async () => fakeVideos(['Male lion roaring', 'Sea lion swimming (OFF-TOPIC)']),
    };

    const all = await adapter.searchAll('lion', { count: 10 });
    const titles = all.flatMap((s: any) => s.results.map((r: any) => r.title));
    assert.ok(
        !titles.some((t: string) => /lion king|lion dance|sea lion|lioness/i.test(t)),
        'off-topic video titles filtered out',
    );
    assert.ok(
        titles.some((t: string) => /lion/i.test(t)),
        'on-topic lion videos present',
    );
});

test('OFFLINE video: "lion" ranks a REAL lion clip first (relevance-first)', async () => {
    const adapter = new FreeVideoAdapter() as any;
    adapter.wiki = {
        name: 'wikimedia',
        search: async () => fakeVideos(['Lion (Panthera leo) resting', 'Lion King trailer (OFF-TOPIC)']),
    };
    adapter.archive = {
        name: 'archive',
        search: async () => fakeVideos(['Male lion portrait clip', 'Sea lion (OFF-TOPIC)']),
    };

    // searchAll applies the relevance filter + relevance-first ranking.
    const all = await adapter.searchAll('lion', { count: 10 });
    assert.ok(all.length > 0, 'should return results');
    const first = all.flatMap((s: any) => s.results)[0];
    assert.ok(
        /lion/i.test(first.title) && !/lion king|sea lion|lion dance/i.test(first.title),
        `first video must be on-topic lion, got: "${first.title}"`,
    );
    // And NO off-topic clip should appear anywhere in the filtered set.
    const titles = all.flatMap((s: any) => s.results.map((r: any) => r.title));
    assert.ok(!titles.some((t: string) => /lion king|sea lion|lion dance/i.test(t)), 'no off-topic clip in results');
});
