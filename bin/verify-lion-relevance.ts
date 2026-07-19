#!/usr/bin/env node
/**
 * verify-lion-relevance.ts — PROVES the "wrong image / wrong video" bug is
 * fixed. Simulates provider responses (off-topic NASA "Lion nebula" +
 * MetMuseum "sea lion" + on-topic Wikimedia "Lion (Panthera leo)") and asserts
 * the FreeImageAdapter ranks the REAL lion photo first and excludes NASA/MET
 * for a generic "lion" query.
 *
 * Run: npx tsx bin/verify-lion-relevance.ts
 */
import { FreeImageAdapter } from '../src/lib/free-image/adapter.js';

// --- Fake providers that mimic each real provider's off-topic behaviour ----
function fakeResults(titles: string[]) {
    return titles.map((t, i) => ({
        id: `fake-${i}`,
        title: t,
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

// Monkeypatch the providers' search() so we run fully offline & deterministically.
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
// NASA would historically return "Lion nebula" — but shouldQuery('nasa','lion') is now false,
// so NASA is never even called. We still wire a fake to prove it's skipped.
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

async function main() {
    let failed = 0;
    const assert = (cond: boolean, msg: string) => {
        console.log(`${cond ? '✅' : '❌'} ${msg}`);
        if (!cond) failed++;
    };

    // 1) "lion" → best asset must be a REAL lion photo, NOT a statue/cartoon/nebula.
    const best = await adapter.searchBest('lion', { count: 10 });
    assert(!!best, 'searchBest("lion") returns a result');
    assert(
        /lion/i.test(best.title) && !/nebula|stone lion|lion king|sea lion/i.test(best.title),
        `searchBest("lion") top hit is on-topic lion (got: "${best.title}")`,
    );

    // 2) "lion" → NASA & MetMuseum must NOT appear in searchAll output.
    const all = await adapter.searchAll('lion', { count: 10 });
    const sources = all.map((s: any) => s.source);
    assert(!sources.includes('nasa'), 'NASA excluded for generic "lion" query');
    assert(!sources.includes('metmuseum'), 'MetMuseum excluded for generic "lion" query');

    // 3) "lion" → off-topic titles (statue, Lion King) filtered out of results.
    const titles = all.flatMap((s: any) => s.results.map((r: any) => r.title));
    assert(
        !titles.some((t: string) => /stone lion|lion king/i.test(t)),
        'off-topic "stone lion"/"Lion King" filtered out',
    );

    // 4) On-topic terms preserved.
    assert(
        titles.some((t: string) => /lion/i.test(t)),
        'on-topic "lion" assets present',
    );

    // 5) Space query SHOULD still include NASA.
    adapter.nasa = { name: 'nasa', search: async () => fakeResults(['Lion nebula in infrared', 'Spiral galaxy']) };
    const space = await adapter.searchAll('galaxy nebula', { count: 10 });
    assert(
        space.some((s: any) => s.source === 'nasa'),
        'NASA INCLUDED for space query "galaxy nebula"',
    );

    console.log(`\n${failed === 0 ? '🎉 ALL CHECKS PASSED — wrong-asset bug fixed' : `❌ ${failed} check(s) failed`}`);
    process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
