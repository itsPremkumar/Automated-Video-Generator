/**
 * security.test.ts — unit tests for path-traversal guard + secret redaction.
 */
import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { safeOutputPath, redactSecrets } from './security.js';

describe('safeOutputPath', () => {
    test('undefined / empty -> undefined (caller uses default inside output/)', () => {
        assert.equal(safeOutputPath(undefined), undefined);
        assert.equal(safeOutputPath(''), undefined);
        assert.equal(safeOutputPath('   '), undefined);
    });

    test('relative path inside output/ is allowed and resolved', () => {
        const p = safeOutputPath('my_clip.mp4');
        assert.ok(p?.replace(/\\/g, '/').includes('/output/my_clip.mp4'));
        assert.ok(!p?.includes('..'));
    });

    test('absolute path inside output/ is allowed', () => {
        const inside = require('path').resolve(process.cwd(), 'output', 'ok.mp4');
        const p = safeOutputPath(inside);
        assert.equal(p, inside);
    });

    test('path traversal via ../ is blocked', () => {
        assert.throws(
            () => safeOutputPath('../../etc/cron'),
            /path traversal blocked/,
        );
    });

    test('absolute path outside output/ is blocked', () => {
        assert.throws(
            () => safeOutputPath('/etc/passwd'),
            /path traversal blocked/,
        );
        assert.throws(
            () => safeOutputPath('C:\\Windows\\system32\\evil.dll'),
            /path traversal blocked/,
        );
    });
});

describe('redactSecrets', () => {
    test('redacts api_key = value', () => {
        const out = redactSecrets('config PEXELS_API_KEY=abc123secret456 ok');
        assert.ok(!out.includes('abc123secret456'));
        assert.match(out, /\[REDACTED:\d+ chars\]/);
    });

    test('redacts token: value', () => {
        const out = redactSecrets('token=ghp_ABCDEFGHIJKLMNOP secret');
        assert.ok(!out.includes('ghp_ABCDEFGHIJKLMNOP'));
    });

    test('leaves benign text untouched', () => {
        const text = 'rendered video in 12.5s with 3 scenes';
        assert.equal(redactSecrets(text), text);
    });
});
