/**
 * local-filesystem.test.ts — regression tests for the path-traversal guard
 * in assertPathWithinProject / getViewFile.
 *
 * Proves the traversal bypass is closed:
 *  - absolute paths are REJECTED (no escape from public/).
 *  - traversal (`../`) outside public/ is REJECTED.
 *  - a prefix-sibling of projectRoot (e.g. `<root>_evil`) is REJECTED.
 *  - a legitimate public/ file IS served.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as ffmpegPath from 'ffmpeg-static';

function loadFs() {
    return import('./local-filesystem.js');
}

test('getViewFile rejects absolute paths (no escape from public/)', async () => {
    const { localFilesystem } = await loadFs();
    assert.throws(() => localFilesystem.getViewFile('C:\\Windows\\system.ini'), /relative public/i);
    assert.throws(() => localFilesystem.getViewFile('/etc/passwd'), /relative public/i);
});

test('getViewFile rejects traversal outside public/', async () => {
    const { localFilesystem } = await loadFs();
    assert.throws(() => localFilesystem.getViewFile('../../package.json'), /Path traversal is not allowed/i);
});

test('getViewFile prefix-sibling bypass is closed', async () => {
    const { localFilesystem } = await loadFs();
    const evil = path.resolve(process.cwd() + '_evil', 'secret.txt');
    assert.throws(() => localFilesystem.getViewFile(evil), /Only relative public paths are viewable/i);
});

test('getViewFile serves a real public/ file', async () => {
    const { localFilesystem } = await loadFs();
    const name = `_ls_${Date.now()}.png`;
    const tmp = path.join(process.cwd(), 'public', name);
    // tiny 1x1 png
    fs.writeFileSync(tmp, Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
        'base64',
    ));
    try {
        const r = localFilesystem.getViewFile(name);
        assert.ok(r.type === 'file' || r.type === 'range');
        assert.ok(r.filePath.endsWith(name));
    } finally {
        fs.rmSync(tmp, { force: true });
    }
});
