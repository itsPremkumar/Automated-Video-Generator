import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureAllowedExtension, buildUniqueFilePath } from './path-safety';
import * as path from 'path';
import * as fs from 'fs';
import os from 'os';
import { makeWorkspaceTempDir, resolveWorkspaceTempPath } from '../shared/runtime/paths.js';

test('ensureAllowedExtension passes for allowed extensions', () => {
    ensureAllowedExtension('video.mp4', ['.mp4', '.mov']);
    ensureAllowedExtension('image.jpg', ['.jpg', '.png']);
    ensureAllowedExtension('audio.mp3', ['.mp3', '.wav']);
});

test('ensureAllowedExtension throws for disallowed extensions', () => {
    assert.throws(() => {
        ensureAllowedExtension('file.exe', ['.mp4', '.jpg']);
    }, /Invalid file extension/);
});

test('buildUniqueFilePath returns original path when no collision', () => {
    const dir = makeWorkspaceTempDir('test-');
    const result = buildUniqueFilePath(dir, 'test.mp4');
    assert.equal(result, path.join(dir, 'test.mp4'));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('buildUniqueFilePath adds counter on collision', () => {
    const dir = makeWorkspaceTempDir('test-');
    const file1 = path.join(dir, 'test.mp4');
    fs.writeFileSync(file1, '');
    const result = buildUniqueFilePath(dir, 'test.mp4');
    assert.equal(result, path.join(dir, 'test_1.mp4'));
    fs.rmSync(dir, { recursive: true, force: true });
});
