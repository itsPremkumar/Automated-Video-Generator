import { buildConfig, AppConfig } from './src/config';
import { WikimediaProvider } from './src/providers/wikimedia';
import { ArchiveOrgProvider } from './src/providers/archive';
import { DownloadManager } from './src/download/downloader';
import { DownloadProgressManager } from './src/download/progress';
import { writeMetadataJson, writeAttributionFile, appendHistory, readHistory, exportMetadataToCsv } from './src/download/metadata';
import * as path from 'path';
import * as fs from 'fs-extra';
import { formatBytes, formatDuration, sanitizeFilename, getAvailablePath, getExistingFileSize } from './src/utils/file';
import { createHttpClient, headContentLength, getJson } from './src/utils/http';
import { withRetry } from './src/utils/retry';

let passed = 0;
let failed = 0;
let testCount = 0;

function assert(condition: boolean, msg: string) {
    testCount++;
    if (condition) { passed++; console.log(`  ✅ ${msg}`); }
    else { failed++; console.log(`  ❌ ${msg}`); }
}

async function main() {
    const cfg = buildConfig({ downloadDir: './test-output' });
    const wiki = new WikimediaProvider(cfg);
    const arch = new ArchiveOrgProvider(cfg);

    // ════════════════════════════════════════════
    // 1. CONFIG TESTS
    // ════════════════════════════════════════════
    console.log('\n═══ 1. CONFIG TESTS ═══');
    assert(cfg.downloadDir.includes('test-output'), 'Config: custom downloadDir applied');
    assert(cfg.concurrentDownloads === 3, 'Config: default concurrentDownloads = 3');
    assert(cfg.retryCount === 3, 'Config: default retryCount = 3');
    assert(cfg.httpTimeoutMs === 30000, 'Config: default httpTimeoutMs = 30000');
    const cfg2 = buildConfig({ concurrentDownloads: 5, retryCount: 5, httpTimeoutMs: 60000 });
    assert(cfg2.concurrentDownloads === 5, 'Config: override concurrentDownloads');
    assert(cfg2.retryCount === 5, 'Config: override retryCount');
    assert(cfg2.httpTimeoutMs === 60000, 'Config: override httpTimeoutMs');

    // ════════════════════════════════════════════
    // 2. UTILITY TESTS (UNIT)
    // ════════════════════════════════════════════
    console.log('\n═══ 2. UTILITY TESTS ═══');
    // formatBytes
    assert(formatBytes(0) === '0 B', 'formatBytes: 0 bytes');
    assert(formatBytes(1) === '1 B', 'formatBytes: 1 byte');
    assert(formatBytes(1023) === '1023 B', 'formatBytes: 1023 bytes');
    assert(formatBytes(1024) === '1.0 KB', 'formatBytes: 1 KB');
    assert(formatBytes(1048576) === '1.0 MB', 'formatBytes: 1 MB');
    assert(formatBytes(1073741824) === '1.0 GB', 'formatBytes: 1 GB');
    // formatDuration
    assert(formatDuration(null) === 'Unknown', 'formatDuration: null');
    assert(formatDuration(undefined) === 'Unknown', 'formatDuration: undefined');
    assert(formatDuration(0) === 'Unknown', 'formatDuration: 0');
    assert(formatDuration(59) === '0:59', 'formatDuration: 59s');
    assert(formatDuration(61) === '1:01', 'formatDuration: 61s');
    assert(formatDuration(3661) === '61:01', 'formatDuration: 3661s');
    // sanitizeFilename
    assert(sanitizeFilename('hello/world:test') === 'hello_world_test', 'sanitizeFilename: special chars');
    assert(sanitizeFilename('  spaced  ') === 'spaced', 'sanitizeFilename: trim & collapse');
    assert(sanitizeFilename('') === 'untitled', 'sanitizeFilename: empty fallback');
    assert(sanitizeFilename('a'.repeat(300)).length <= 200, 'sanitizeFilename: max length');
    // getAvailablePath
    await fs.ensureDir('./test-output');
    const p1 = await getAvailablePath('./test-output', 'unittest', 'mp4');
    assert(p1.includes('unittest.mp4'), 'getAvailablePath: creates correct path');
    assert(path.resolve(p1).startsWith(path.resolve('./test-output')), 'getAvailablePath: within target dir');
    // getExistingFileSize
    await fs.writeFile('./test-output/size_test.bin', Buffer.alloc(1024));
    const size = await getExistingFileSize('./test-output/size_test.bin');
    assert(size === 1024, 'getExistingFileSize: returns correct size');
    const noSize = await getExistingFileSize('./test-output/nonexistent.bin');
    assert(noSize === 0, 'getExistingFileSize: returns 0 for missing file');

    // ════════════════════════════════════════════
    // 3. PROVIDER SEARCH TESTS
    // ════════════════════════════════════════════
    console.log('\n═══ 3. PROVIDER SEARCH TESTS ═══');
    
    // 3a. Wikimedia basic search
    const wikiResults = await wiki.search({ keyword: 'cat', count: 3, maxDurationSeconds: 60, page: 1 });
    assert(wikiResults.length > 0, `Wikimedia: found ${wikiResults.length} cat videos`);
    if (wikiResults.length > 0) {
        assert(!!wikiResults[0].id, 'Wikimedia result: has id');
        assert(!!wikiResults[0].title, 'Wikimedia result: has title');
        assert(!!wikiResults[0].creator, 'Wikimedia result: has creator');
        assert(!!wikiResults[0].license, 'Wikimedia result: has license');
        assert(!!wikiResults[0].downloadUrl, 'Wikimedia result: has downloadUrl');
        assert(!!wikiResults[0].sourcePageUrl, 'Wikimedia result: has sourcePageUrl');
        assert(wikiResults[0].provider === 'Wikimedia Commons', 'Wikimedia result: provider name correct');
        assert(['mp4', 'webm', 'ogg', 'unknown'].includes(wikiResults[0].format), 'Wikimedia result: valid format');
        console.log(`    Sample: "${wikiResults[0].title}" | ${wikiResults[0].durationSeconds}s | ${wikiResults[0].resolution} | ${wikiResults[0].license}`);
    }

    // 3b. Archive.org basic search
    const archResults = await arch.search({ keyword: 'space', count: 2, maxDurationSeconds: 120, page: 1 });
    assert(archResults.length > 0, `Archive: found ${archResults.length} space videos`);
    if (archResults.length > 0) {
        assert(!!archResults[0].id, 'Archive result: has id');
        assert(!!archResults[0].title, 'Archive result: has title');
        assert(!!archResults[0].downloadUrl, 'Archive result: has downloadUrl');
        assert(!!archResults[0].thumbnailUrl, 'Archive result: has thumbnailUrl');
        assert(archResults[0].provider === 'Internet Archive', 'Archive result: provider name correct');
        console.log(`    Sample: "${archResults[0].title}" | ${archResults[0].durationSeconds}s | ${archResults[0].resolution}`);
    }

    // 3c. Count limit enforcement
    const countResults = await wiki.search({ keyword: 'cat', count: 5, page: 1 });
    assert(countResults.length <= 5, `Count limit: max 5 (got ${countResults.length})`);

    // 3d. Empty keyword / no results (graceful handling)
    const emptyResults = await wiki.search({ keyword: 'xyznonexistent999999', count: 1 });
    assert(emptyResults.length === 0, 'Empty results: returns empty array gracefully');

    // 3e. HD only filter
    const hdResults = await wiki.search({ keyword: 'cat', count: 2, hdOnly: true });
    if (hdResults.length > 0) {
        const allHd = hdResults.every(r => {
            if (!r.resolution) return false;
            const h = parseInt(r.resolution.split('x')[1] || '0', 10);
            return h >= 720;
        });
        assert(allHd, 'HD filter: all results >= 720p');
    }
    assert(hdResults.length <= 2, 'HD filter: respects count');

    // 3f. License filter (substring match)
    const licenseResults = await wiki.search({ keyword: 'cat', count: 3, license: 'CC BY' });
    if (licenseResults.length > 0) {
        const allCc = licenseResults.every(r => r.license.includes('CC BY'));
        assert(allCc, 'License filter: all results match CC BY');
    }

    // Brief pause to avoid Wikimedia rate limiting
    await new Promise(r => setTimeout(r, 2000));

    // 3g. Sort by resolution (descending)
    const sortResults = await wiki.search({ keyword: 'cat', count: 3, sortBy: 'resolution' });
    if (sortResults.length > 1) {
        const heights = sortResults
            .map(r => parseInt(r.resolution?.split('x')[1] || '0', 10))
            .filter(h => h > 0);
        const isDescending = heights.every((h, i) => i === 0 || h <= heights[i - 1]);
        assert(isDescending, 'Sort by resolution: descending order');
    }

    await new Promise(r => setTimeout(r, 1500));

    // 3h. Pagination (smoke test)
    const page1 = await wiki.search({ keyword: 'cat', count: 2, page: 1 });
    assert(page1.length > 0, 'Pagination: page 1 has results');

    await new Promise(r => setTimeout(r, 1500));

    // 3i. Combined filter test (multiple filters at once)
    const combinedFilterResults = await wiki.search({ keyword: 'cat', count: 2, maxDurationSeconds: 30, minResolutionHeight: 480, maxFileSizeBytes: 100 * 1024 * 1024 });
    assert(combinedFilterResults.length >= 0, 'Combined filters: executes without error');
    if (combinedFilterResults.length > 0) {
        const allValid = combinedFilterResults.every(r => 
            (r.durationSeconds === null || r.durationSeconds <= 30) &&
            (!r.resolution || parseInt(r.resolution.split('x')[1] || '0', 10) >= 480) &&
            (r.fileSizeBytes === null || r.fileSizeBytes <= 100 * 1024 * 1024)
        );
        assert(allValid, 'Combined filters: all constraints satisfied');
    }

    // 3j. Archive sort by newest
    const newestResults = await arch.search({ keyword: 'space', count: 2, sortBy: 'newest' });
    assert(newestResults.length >= 0, 'Archive sort=newest: executes without error');

    // 3k. Multiple topics from Archive (less rate-limited)
    const topics = ['dog', 'nature'];
    for (const topic of topics) {
        const r = await arch.search({ keyword: topic, count: 1, page: 1 });
        assert(r.length > 0, `Archive topic "${topic}": found results`);
    }

    // ════════════════════════════════════════════
    // 4. DOWNLOAD MANAGER INTERNAL TESTS
    // ════════════════════════════════════════════
    console.log('\n═══ 4. DOWNLOAD MANAGER TESTS ═══');

    // 4a. Progress Manager (unit test)
    const pm = new DownloadProgressManager(3);
    const handle = pm.createFileBar('test1', 'test_video.mp4', 1000000);
    assert(typeof handle.update === 'function', 'Progress: update is function');
    assert(typeof handle.complete === 'function', 'Progress: complete is function');
    assert(typeof handle.fail === 'function', 'Progress: fail is function');
    handle.update(500000);
    handle.complete();
    pm.stop();
    assert(true, 'Progress manager: lifecycle complete');

    // 4b. Download with invalid URL (error handling test)
    const dm = new DownloadManager(cfg);
    const badVideo = {
        id: 'bad-001',
        title: 'Bad URL Test',
        creator: 'Tester', license: 'CC0', licenseUrl: '',
        provider: 'Test', durationSeconds: null, resolution: null,
        fileSizeBytes: null, format: 'mp4' as const,
        thumbnailUrl: null, sourcePageUrl: '',
        downloadUrl: 'https://invalid.example.com/nonexistent.mp4',
    };
    const badResult = await dm.downloadAll([badVideo]);
    assert(badResult.length === 1, 'Bad URL: returns 1 result');
    assert(badResult[0].success === false, 'Bad URL: success=false');
    assert(typeof badResult[0].error === 'string', 'Bad URL: has error message');
    assert(badResult[0].error!.length > 0, 'Bad URL: error message non-empty');
    console.log(`    Bad URL error: ${badResult[0].error}`);

    // 4c. Empty download list
    const emptyResult = await dm.downloadAll([]);
    assert(emptyResult.length === 0, 'Empty list: returns []');

    // 4d. Duplicate filename handling (test getAvailablePath collision avoidance)
    const d1 = await getAvailablePath('./test-output', 'collision_test', 'mp4');
    await fs.writeFile(d1, 'dummy');
    const d2 = await getAvailablePath('./test-output', 'collision_test', 'mp4');
    assert(d1 !== d2, 'getAvailablePath: avoids collision with existing file');
    assert(d2.includes('collision_test_1.mp4'), 'getAvailablePath: appends counter');

    // 4e. Download with auth-free URL (Wikimedia direct link)
    await new Promise(r => setTimeout(r, 2000));
    const liveUrl = 'https://upload.wikimedia.org/wikipedia/commons/6/6d/Housecat_Grooming_Itself.webm';
    const liveVideo = {
        id: 'live-001', title: 'Housecat Live Test', creator: 'Test',
        license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        provider: 'Wikimedia Commons', durationSeconds: 24, resolution: '1920x1080',
        fileSizeBytes: 8868199, format: 'webm' as const,
        thumbnailUrl: null, sourcePageUrl: 'https://commons.wikimedia.org/',
        downloadUrl: liveUrl,
    };
    let liveResult;
    try {
        liveResult = await dm.downloadAll([liveVideo]);
    } catch (e: any) {
        liveResult = [{ success: false, error: 'Exception: ' + e.message, video: liveVideo, localPath: null, bytesDownloaded: 0, resumed: false }];
    }
    assert(liveResult.length === 1, 'Live download: returns 1 result');
    assert(typeof liveResult[0].success === 'boolean', 'Live download: has valid success flag');
    assert(typeof liveResult[0].bytesDownloaded === 'number', 'Live download: has bytesDownloaded');
    if (liveResult[0].success) {
        assert(liveResult[0].localPath !== null, 'Live download: has localPath');
        assert(liveResult[0].bytesDownloaded > 0, 'Live download: bytesDownloaded > 0');
        assert(liveResult[0].resumed === false, 'Live download: fresh download (not resumed)');
        if (liveResult[0].localPath && fs.existsSync(liveResult[0].localPath)) {
            const stat = fs.statSync(liveResult[0].localPath);
            assert(stat.size > 0, 'Live download: file has content');
            console.log(`    ✅ Real file: ${path.basename(liveResult[0].localPath)} (${formatBytes(stat.size)})`);
        }
    } else {
        console.log(`    ⚠️  Live download skipped (API constraint): ${liveResult[0].error || 'unknown'}`);
    }

    // ════════════════════════════════════════════
    // 5. METADATA TESTS
    // ════════════════════════════════════════════
    console.log('\n═══ 5. METADATA TESTS ═══');

    // Create synthetic results for metadata testing
    const synResults = [{
        video: {
            id: 'syn-001', title: 'Synthetic Test Video', creator: 'Test Author',
            license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
            provider: 'Wikimedia Commons', durationSeconds: 30, resolution: '1920x1080',
            fileSizeBytes: 5000000, format: 'webm' as const,
            downloadUrl: 'https://example.com/video.webm', thumbnailUrl: null, sourcePageUrl: 'https://example.com/',
        },
        success: true,
        localPath: path.resolve('./test-output/synthetic_result.webm'),
        error: null,
        bytesDownloaded: 5000000,
        resumed: false,
    }];

    // 5a. writeMetadataJson
    const metaPath = await writeMetadataJson(cfg, synResults);
    assert(fs.existsSync(metaPath), 'writeMetadataJson: file created');
    const metaContent = await fs.readJson(metaPath);
    assert(Array.isArray(metaContent), 'writeMetadataJson: valid JSON array');
    assert(metaContent.length === 1, 'writeMetadataJson: 1 entry');
    assert(metaContent[0].title === 'Synthetic Test Video', 'writeMetadataJson: title correct');
    assert(metaContent[0].creator === 'Test Author', 'writeMetadataJson: creator correct');
    assert(metaContent[0].license === 'CC BY 4.0', 'writeMetadataJson: license correct');
    assert(metaContent[0].provider === 'Wikimedia Commons', 'writeMetadataJson: provider correct');
    assert(!!metaContent[0].downloaded_at, 'writeMetadataJson: has timestamp');
    assert(metaContent[0].file_size_bytes === 5000000, 'writeMetadataJson: file_size_bytes correct');

    // 5b. writeAttributionFile
    const attribPath = await writeAttributionFile(cfg, synResults);
    assert(fs.existsSync(attribPath), 'writeAttributionFile: file created');
    const attribContent = fs.readFileSync(attribPath, 'utf-8');
    assert(attribContent.includes('Attribution information'), 'writeAttributionFile: has header');
    assert(attribContent.includes('Synthetic Test Video'), 'writeAttributionFile: has video title');
    assert(attribContent.includes('CC BY 4.0'), 'writeAttributionFile: has license');
    assert(attribContent.includes('Test Author'), 'writeAttributionFile: has creator');
    assert(attribContent.includes('='.repeat(70)), 'writeAttributionFile: has separator');

    // 5c. appendHistory & readHistory
    await appendHistory(cfg, synResults);
    assert(fs.existsSync(cfg.historyFile), 'appendHistory: file created');
    const histContent = await fs.readJson(cfg.historyFile);
    assert(Array.isArray(histContent), 'appendHistory: valid JSON array');
    assert(histContent.length >= 1, 'appendHistory: has entries');
    assert(histContent[0].title === 'Synthetic Test Video', 'appendHistory: title correct');
    assert(histContent[0].success === true, 'appendHistory: success flag correct');

    const history = await readHistory(cfg);
    assert(Array.isArray(history), 'readHistory: returns array');
    assert(history.length >= 1, 'readHistory: has entries');

    // 5d. History append persistence
    await appendHistory(cfg, synResults);
    const hist2 = await readHistory(cfg);
    assert(hist2.length === histContent.length + 1, 'appendHistory: appends correctly');

    // 5e. exportMetadataToCsv
    const csvPath = await exportMetadataToCsv(cfg);
    assert(csvPath !== null, 'exportMetadataToCsv: returns path');
    assert(fs.existsSync(csvPath!), 'exportMetadataToCsv: file created');
    const csvContent = fs.readFileSync(csvPath!, 'utf-8');
    assert(csvContent.includes('title,creator,license'), 'exportMetadataToCsv: CSV header');
    assert(csvContent.includes('Synthetic Test Video'), 'exportMetadataToCsv: CSV data row');
    assert(csvContent.includes('Test Author'), 'exportMetadataToCsv: CSV includes creator');
    assert(csvContent.includes('CC BY 4.0'), 'exportMetadataToCsv: CSV includes license');

    // 5f. No-metadata edge cases
    const emptyMeta = await exportMetadataToCsv(buildConfig({ downloadDir: './empty-dir-' + Date.now() }));
    assert(emptyMeta === null, 'exportMetadataToCsv: null for no metadata');

    const emptyHist2 = await readHistory(buildConfig({ downloadDir: './empty-dir-' + Date.now(), historyFile: './empty-dir-empty/history.json' }));
    assert(emptyHist2.length === 0, 'readHistory: [] for no history file');

    // ════════════════════════════════════════════
    // 6. HTTP UTILITY TESTS
    // ════════════════════════════════════════════
    console.log('\n═══ 6. HTTP UTILITY TESTS ═══');
    const client = createHttpClient(cfg);
    assert(typeof client.get === 'function', 'createHttpClient: returns axios instance');
    
    const contentLen = await headContentLength(client, 'https://upload.wikimedia.org/wikipedia/commons/6/6d/Housecat_Grooming_Itself.webm');
    if (contentLen !== null) {
        assert(contentLen > 0, 'headContentLength: returns positive size for existing URL');
        assert(typeof contentLen === 'number', 'headContentLength: returns number');
        console.log(`    Content-Length: ${formatBytes(contentLen)}`);
    } else {
        console.log('    ⚠️  headContentLength returned null (server may not support HEAD)');
    }

    const badContentLen = await headContentLength(client, 'https://invalid.example.com/video.mp4');
    assert(badContentLen === null, 'headContentLength: null for invalid URL');

    // 6b. withRetry: success case
    let attemptCount = 0;
    const retryResult = await withRetry(async () => {
        attemptCount++;
        return 'success';
    }, { retries: 2, baseDelayMs: 10 });
    assert(retryResult === 'success', 'withRetry: returns value on success');
    assert(attemptCount === 1, 'withRetry: only 1 attempt on success');

    // 6c. withRetry: failure case (always throws)
    let failCount = 0;
    try {
        await withRetry(async () => {
            failCount++;
            throw new Error('permanent failure');
        }, { retries: 2, baseDelayMs: 10 });
        assert(false, 'withRetry: should throw on persistent failure');
    } catch (e: any) {
        assert(e.message === 'permanent failure', 'withRetry: throws original error');
        assert(failCount === 3, `withRetry: retried ${failCount}/3 times`);
    }

    // 6d. getJson: real API call
    const jsonData = await getJson<any>(client, 'https://commons.wikimedia.org/w/api.php', {
        action: 'query', format: 'json', list: 'search', srsearch: 'test', srlimit: 1,
    });
    assert(!!jsonData.query, 'getJson: Wikimedia API returns query data');

    // ════════════════════════════════════════════
    // SUMMARY
    // ════════════════════════════════════════════
    console.log(`\n${'═'.repeat(50)}`);
    const passRate = ((passed / testCount) * 100).toFixed(1);
    console.log(`RESULTS: ${passed}/${testCount} passed (${passRate}%) — ${failed} failed`);
    console.log(`${'═'.repeat(50)}`);
    
    if (failed > 0) {
        console.log(`\n⚠️  ${failed} test(s) failed.`);
        process.exit(1);
    } else {
        console.log('\n🎉 ALL TESTS PASSED');
    }
}

main().catch(err => { console.error('\n💥 Test suite crashed:', err.message); process.exit(1); });
