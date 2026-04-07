import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import test from 'node:test';
import { deleteOutput } from './adapters/mcp/output-store';
import { cleanupAssets } from './lib/cleaner';
import { createPipelineWorkspace, resolveAssetWorkspaceDir } from './pipeline-workspace';
import { projectRoot } from './shared/runtime/paths';

test('createPipelineWorkspace reuses output id from public namespace', () => {
    const workspace = createPipelineWorkspace(path.join(projectRoot, 'output', 'demo_video'), 'jobs/demo_video');

    assert.equal(workspace.outputId, 'demo_video');
    assert.equal(workspace.publicNamespace, 'jobs/demo_video');
});

test('resolveAssetWorkspaceDir rejects invalid namespaces', () => {
    assert.throws(() => resolveAssetWorkspaceDir('../outside'), /Invalid asset namespace/);
    assert.throws(() => resolveAssetWorkspaceDir('jobs/demo/extra'), /Invalid asset namespace/);
});

test('deleteOutput rejects path traversal video ids', async () => {
    await assert.rejects(() => deleteOutput('../outside'), /Invalid video ID/);
    await assert.rejects(() => deleteOutput('..\\outside'), /Invalid video ID/);
});

test('cleanupAssets ignores directories outside managed runtime roots', async () => {
    const outsideDir = path.join(projectRoot, 'cleanup-safety-test');
    const markerFile = path.join(outsideDir, 'marker.txt');

    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(markerFile, 'keep-me');

    try {
        await cleanupAssets([outsideDir]);
        assert.equal(fs.existsSync(markerFile), true);
    } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
    }
});
