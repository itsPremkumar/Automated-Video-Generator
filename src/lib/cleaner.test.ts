import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import { cleanupAssets } from './cleaner';
import { makeWorkspaceTempDir, resolveWorkspaceTempPath } from '../shared/runtime/paths.js';

test('cleanupAssets does not throw for directories outside managed runtime roots', async () => {
    const tmpDir = makeWorkspaceTempDir('cleaner-test-');
    try {
        const result = await cleanupAssets([path.join(tmpDir, 'nonexistent')]);
        assert.equal(result, undefined);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});
