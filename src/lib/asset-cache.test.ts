import assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { getCached, storeCached, clearCache } from './asset-cache.js';

const tmp = path.join(os.tmpdir(), `ac-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
fs.mkdirSync(tmp, { recursive: true });

function writeTmp(name: string, body: string): string {
    fs.mkdirSync(tmp, { recursive: true });
    const p = path.join(tmp, name);
    fs.writeFileSync(p, body);
    return p;
}

test('storeCached then getCached returns a fresh copy (TTL 0 = forever)', () => {
    clearCache();
    const url = 'https://example.com/asset-A.jpg';
    const src = writeTmp('srcA.jpg', 'fake-jpeg-bytes-' + 'x'.repeat(2000));
    storeCached(url, src);
    const hit = getCached(url, 0);
    assert.ok(hit, 'expected a cache hit');
    assert.ok(fs.existsSync(hit!), 'cached file should exist');
    assert.ok(fs.statSync(hit!).size >= 500, 'cached file should be non-trivial');
    // content matches
    assert.strictEqual(fs.readFileSync(hit!, 'utf8'), fs.readFileSync(src, 'utf8'));
});

test('getCached returns null for unknown url and for too-small files', () => {
    clearCache();
    assert.strictEqual(getCached('https://example.com/never-downloaded.png', 0), null);
    const tiny = writeTmp('tiny.png', 'xy');
    storeCached('https://example.com/tiny.png', tiny);
    assert.strictEqual(getCached('https://example.com/tiny.png', 0), null, 'tiny files should not be cached');
});

test('TTL expiry turns a hit into a miss', () => {
    clearCache();
    const url = 'https://example.com/ttl.jpg';
    const src = writeTmp('ttl.jpg', 'data-' + 'y'.repeat(2000));
    storeCached(url, src);
    assert.ok(getCached(url, 0), 'fresh entry hit with TTL 0');
    // TTL of 1ms => wait past it so the expiry check is deterministic
    // (the cache compares file mtime against wall-clock; a tiny sleep avoids a
    // sub-millisecond race on fast runners).
    return new Promise<void>((resolve) => setTimeout(() => {
        assert.strictEqual(getCached(url, 1), null, 'expired entry should miss');
        resolve();
    }, 5));
});

test('clearCache removes entries', () => {
    const url = 'https://example.com/clear.jpg';
    const src = writeTmp('clear.jpg', 'z'.repeat(2000));
    storeCached(url, src);
    assert.ok(getCached(url, 0));
    clearCache();
    assert.strictEqual(getCached(url, 0), null);
});

fs.rmSync(tmp, { recursive: true, force: true });
