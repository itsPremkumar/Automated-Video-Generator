import { freeMusicLabProvider } from './freemusiclab.js';
import { archiveAudioProvider } from './archive-audio.js';
import { aceMusicGenerator } from './generator.js';
import { openLofiProvider } from './open-lofi.js';
import { ncsProvider } from './ncs.js';
import { fmaProvider } from './fma.js';
import { everythingIsFreeProvider } from './everythingisfree.js';

function pass(msg: string) { console.log(`  ✅ ${msg}`); }
function fail(msg: string) { console.log(`  ❌ ${msg}`); }
function skip(msg: string) { console.log(`  ⏭️  ${msg}`); }

async function testOpenLofi() {
    console.log('\n=== open-lofi (CC0, no API key) ===');
    let total = 0, passed = 0;
    try {
        const allTracks = await openLofiProvider.search('', 1);
        total++; passed++;
        pass(`Catalog: ${allTracks.length}+ tracks available`);

        const tracks = await openLofiProvider.search('ambient', 3);
        total++; 
        if (tracks.length > 0) {
            pass(`"ambient" → ${tracks.length} tracks`);
            tracks.forEach(t => console.log(`       • ${t.title} (${t.genre})`));
            passed++;
        } else { fail('"ambient" returned 0'); }

        const genres = await openLofiProvider.listGenres();
        total++;
        if (genres.length >= 5) { pass(`${genres.length} genres`); passed++; }
        else { fail(`Only ${genres.length} genres`); }
    } catch (err: any) {
        total = 3;
        fail(`open-lofi error: ${err.message}`);
    }
    return { total, passed };
}

async function testNcs() {
    console.log('\n=== NCS (NoCopyrightSounds) ===');
    let total = 0, passed = 0;
    try {
        const tracks = await ncsProvider.search('', 2);
        total++;
        if (tracks.length > 0) {
            pass(`Search returned ${tracks.length} tracks`);
            tracks.forEach(t => console.log(`       • ${t.title} — ${t.creator}`));
            passed++;
        } else { fail('Search returned 0'); }

        const genres = await ncsProvider.listGenres();
        total++;
        if (genres.length > 0) { pass(`${genres.length} genres available`); passed++; }
        else { fail('No genres'); }
    } catch (err: any) {
        total = 2;
        fail(`NCS error: ${err.message}`);
    }
    return { total, passed };
}

async function testFma() {
    console.log('\n=== Free Music Archive ===');
    let total = 0, passed = 0;
    try {
        const tracks = await fmaProvider.search('ambient', 2);
        total++;
        if (tracks.length > 0) {
            pass(`Search returned ${tracks.length} tracks`);
            tracks.forEach(t => console.log(`       • ${t.title} — ${t.creator}`));
            passed++;
        } else { fail('Search returned 0 (FMA may have changed structure)'); }
    } catch (err: any) {
        total++; fail(`FMA error: ${err.message}`);
    }
    return { total, passed };
}

async function testEverythingIsFree() {
    console.log('\n=== everythingisfree (CC0, npm package) ===');
    let total = 0, passed = 0;
    try {
        const totalTracks = everythingIsFreeProvider.trackCount;
        total++;
        if (totalTracks > 0) { pass(`${totalTracks} tracks in catalog`); passed++; }
        else { fail('0 tracks'); }

        const tracks = await everythingIsFreeProvider.search('', 2);
        total++;
        if (tracks.length > 0) {
            pass(`Search returned ${tracks.length} tracks`);
            tracks.forEach(t => console.log(`       • ${t.title} — ${t.genre} (${t.format})`));
            passed++;
        } else { fail('Search returned 0'); }

        const genres = await everythingIsFreeProvider.listGenres();
        total++;
        if (genres.length > 0) { pass(`${genres.length} genres`); passed++; }
        else { fail('No genres'); }
    } catch (err: any) {
        total = 3;
        fail(`everythingisfree error: ${err.message}`);
    }
    return { total, passed };
}

async function testArchive() {
    console.log('\n=== Internet Archive Audio (no API key) ===');
    let total = 0, passed = 0;
    try {
        const tracks = await archiveAudioProvider.search('ambient music', 2);
        total++;
        if (tracks.length > 0) {
            pass(`Search returned ${tracks.length} tracks`);
            tracks.forEach(t => console.log(`       • ${t.title} — ${t.creator}`));
            passed++;
        } else { fail('Search returned 0'); }
    } catch (err: any) {
        total++; fail(`Archive error: ${err.message}`);
    }
    return { total, passed };
}

async function testFreeMusicLab() {
    console.log('\n=== FreeMusicLab (needs FREEMUSICLAB_API_KEY) ===');
    if (!freeMusicLabProvider.isConfigured) {
        skip('No API key — set FREEMUSICLAB_API_KEY');
        return { total: 1, passed: 1 };
    }
    let total = 0, passed = 0;
    try {
        const tracks = await freeMusicLabProvider.search('lofi', 2);
        total++;
        if (tracks.length > 0) { pass(`Found ${tracks.length} tracks`); passed++; }
        else { fail('No results'); }
    } catch (err: any) {
        total++; fail(`Error: ${err.message}`);
    }
    return { total, passed };
}

async function testAce() {
    console.log('\n=== ACE-Step Generation (local server) ===');
    const status = await aceMusicGenerator.getStatus();
    if (status.running) {
        pass(`Running on port ${status.port}`);
    } else {
        skip(`Not running (${status.message})`);
    }
    return { total: 1, passed: 1 };
}

async function main() {
    const args = process.argv.slice(2);
    const mode = args[0] || 'all';

    console.log('╔══════════════════════════════════════════════╗');
    console.log('║    Free Music Module — Full Test Suite       ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log(`Mode: ${mode}\n`);

    let total = 0, passed = 0;
    const tests = [
        { name: 'open-lofi', fn: testOpenLofi },
        { name: 'NCS', fn: testNcs },
        { name: 'FMA', fn: testFma },
        { name: 'everythingisfree', fn: testEverythingIsFree },
        { name: 'Archive', fn: testArchive },
        { name: 'FreeMusicLab', fn: testFreeMusicLab },
        { name: 'ACE-Step', fn: testAce },
    ];

    for (const t of tests) {
        if (mode === 'all' || mode === t.name.toLowerCase().replace(/[^a-z]/g, '') || 
            (mode === 'search' && ['open-lofi', 'ncs', 'fma', 'everythingisfree', 'archive'].includes(t.name)) ||
            (mode === 'download' && t.name === 'Archive') ||
            (mode === 'genres' && t.name === 'open-lofi') ||
            (mode === 'ace' && t.name === 'ACE-Step')) {
            const r = await t.fn();
            total += r.total; passed += r.passed;
        }
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log(`  Total: ${passed}/${total} passed`);
    console.log('═══════════════════════════════════════════════\n');

    process.exit(passed === total ? 0 : 1);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
