import assert from 'node:assert/strict';
import test from 'node:test';
import * as stream from 'node:stream';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FreeDownloadManager } from './downloader.js';
import type { AxiosInstance } from 'axios';
import type { VideoResult } from '../models.js';
import { makeWorkspaceTempDir, resolveWorkspaceTempPath } from '../../../shared/runtime/paths.js';

function makeVideo(url: string): VideoResult {
    return {
        id: 'test-1',
        title: 'Test Clip',
        creator: 'tester',
        license: 'CC0',
        licenseUrl: 'https://example.com/license',
        provider: 'Test',
        downloadUrl: url,
        thumbnailUrl: null,
        durationSeconds: 6,
        resolution: '1920x1080',
        fileSizeBytes: 1000,
        format: 'mp4',
        sourcePageUrl: 'https://example.com/source',
    };
}

// A stubbed axios client whose `get` returns a controlled readable stream.
function makeStubClient(data: stream.Readable, status = 200): AxiosInstance {
    const client = {
        get: async () => ({ data, status }),
    } as unknown as AxiosInstance;
    return client;
}

test('stall guard: a stream that never sends data fails fast (does not hang)', async () => {
    const tmp = makeWorkspaceTempDir('avg-stall-');
    try {
        // PassThrough that is opened but never receives a single chunk -> stalls.
        const stalled = new stream.PassThrough();
        const manager = new FreeDownloadManager({
            stallTimeoutMs: 400,
            retryCount: 0,
            client: makeStubClient(stalled, 200),
        });

        const start = Date.now();
        const results = await manager.downloadAll([makeVideo('https://example.com/stall.mp4')], tmp);
        const elapsed = Date.now() - start;

        // Must fail quickly (well under a normal 30s hang) instead of blocking forever.
        assert.ok(elapsed < 5000, `expected fast failure, took ${elapsed}ms`);
        assert.equal(results.length, 1);
        assert.equal(results[0].success, false);
        assert.match(results[0].error ?? '', /stall/i);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('healthy stream completes and writes a file', async () => {
    const tmp = makeWorkspaceTempDir('avg-ok-');
    try {
        const src = stream.Readable.from([Buffer.from('hello-world-bytes')]);
        const manager = new FreeDownloadManager({
            stallTimeoutMs: 400,
            retryCount: 0,
            client: makeStubClient(src, 200),
        });

        const results = await manager.downloadAll([makeVideo('https://example.com/ok.mp4')], tmp);
        assert.equal(results.length, 1);
        assert.equal(results[0].success, true);
        assert.ok(results[0].localPath && fs.existsSync(results[0].localPath));
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});
