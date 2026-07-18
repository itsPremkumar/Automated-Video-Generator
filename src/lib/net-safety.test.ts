/**
 * net-safety.test.ts — SSRF guard unit tests.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeUrl } from './net-safety.js';

describe('isSafeUrl (SSRF guard)', () => {
    test('allows public http/https URLs', () => {
        assert.deepEqual(isSafeUrl('https://example.com/video.mp4'), { ok: true });
        assert.deepEqual(isSafeUrl('http://cdn.pexels.com/a/b/c.jpg'), { ok: true });
    });

    test('rejects non-http(s) schemes', () => {
        assert.equal(isSafeUrl('file:///etc/passwd').ok, false);
        assert.equal(isSafeUrl('ftp://evil/x').ok, false);
        assert.equal(isSafeUrl('gopher://x').ok, false);
    });

    test('rejects malformed URLs', () => {
        assert.equal(isSafeUrl('not a url').ok, false);
        assert.equal(isSafeUrl('').ok, false);
    });

    test('rejects loopback / localhost', () => {
        assert.equal(isSafeUrl('http://localhost:3001/secret').ok, false);
        assert.equal(isSafeUrl('http://127.0.0.1:8080/').ok, false);
        assert.equal(isSafeUrl('http://[::1]/').ok, false);
    });

    test('rejects cloud metadata + private ranges', () => {
        assert.equal(isSafeUrl('http://169.254.169.254/latest/meta-data/').ok, false);
        assert.equal(isSafeUrl('http://192.168.1.1/').ok, false);
        assert.equal(isSafeUrl('http://10.0.0.5/').ok, false);
        assert.equal(isSafeUrl('http://172.16.0.1/').ok, false);
    });

    test('rejects .internal / .local hostnames', () => {
        assert.equal(isSafeUrl('http://secrets.internal/creds').ok, false);
        assert.equal(isSafeUrl('http://host.local/x').ok, false);
    });
});
