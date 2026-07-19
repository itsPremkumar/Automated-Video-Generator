import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cp from 'child_process';
import * as fs from 'fs';

/**
 * pipeline-commands.test.ts
 *
 * Tests the security-critical allowlist-based exec() in pipeline-commands.ts.
 *
 * Mocks installed directly on the require cache (CJS module namespaces).
 * fs patches prevent job-store file I/O during pipeline-commands module loading.
 * cp.exec is patched to prevent real command execution.
 */

const ALLOWED = ['generate', 'resume', 'segment', 'remotion:render', 'remotion:studio'];

// ---------------------------------------------------------------------------
// Save originals for cleanup
// ---------------------------------------------------------------------------
const origExec = cp.exec;
const fsOrig = {
    existsSync: fs.existsSync,
    readFileSync: fs.readFileSync,
    writeFileSync: fs.writeFileSync,
    renameSync: fs.renameSync,
};

function mockFsForPipeline() {
    (fs as any).existsSync = () => false as any;
    (fs as any).readFileSync = () => '{}' as any;
    (fs as any).writeFileSync = (() => {}) as any;
    (fs as any).renameSync = (() => {}) as any;
}

function restoreFs() {
    (fs as any).existsSync = fsOrig.existsSync;
    (fs as any).readFileSync = fsOrig.readFileSync;
    (fs as any).writeFileSync = fsOrig.writeFileSync;
    (fs as any).renameSync = fsOrig.renameSync;
}

// ---------------------------------------------------------------------------
// Allowlist validation — pure logic, no mocking needed (throws before exec)
// ---------------------------------------------------------------------------
test('runPipelineCommand: rejects command not in allowlist', async () => {
    const { runPipelineCommand } = await import('./pipeline-commands.js');

    for (const bad of ['', 'rm -rf /', 'npm run generate', 'generate --danger', 'evil', 'ls', 'sudo']) {
        await assert.rejects(
            () => runPipelineCommand(bad),
            { name: 'Error', message: /not whitelisted/ },
            `should reject "${bad}"`,
        );
    }
});

test('runPipelineCommand: error message lists all allowed commands', async () => {
    const { runPipelineCommand } = await import('./pipeline-commands.js');

    let captured: any;
    try {
        await runPipelineCommand('hack');
    } catch (err) {
        captured = err;
    }
    assert.ok(captured, 'should throw');
    assert.match(captured.message, /not whitelisted/);
    for (const cmd of ALLOWED) {
        assert.ok(captured.message.includes(cmd), `error message should mention "${cmd}"`);
    }
});

test('runPipelineCommand: rejects empty command', async () => {
    const { runPipelineCommand } = await import('./pipeline-commands.js');

    await assert.rejects(
        () => runPipelineCommand(''),
        { message: /not whitelisted/ },
    );
});

// ---------------------------------------------------------------------------
// Allowed commands — mock exec + fs to prevent real execution
// ---------------------------------------------------------------------------
test('runPipelineCommand: allowed commands proceed and return correct shape', async () => {
    const execCalls: string[] = [];
    (cp as any).exec = ((cmd: string, _opts: any, cb?: any) => {
        execCalls.push(cmd);
        if (typeof cb === 'function') cb(null, 'mock stdout', '');
        return {} as any;
    }) as any;
    mockFsForPipeline();

    const { runPipelineCommand } = await import('./pipeline-commands.js');

    try {
        for (const cmd of ALLOWED) {
            const result = await runPipelineCommand(cmd);
            assert.ok(result.jobId, `should return jobId for "${cmd}"`);
            assert.ok(result.jobId.startsWith('exec_'), 'jobId starts with exec_');
            assert.ok(result.command.includes(cmd), 'command includes the npm script');
        }
    } finally {
        (cp as any).exec = origExec;
        restoreFs();
    }
});

test('runPipelineCommand: allows passing arguments on allowed commands', async () => {
    (cp as any).exec = ((cmd: string, _opts: any, cb?: any) => {
        if (typeof cb === 'function') cb(null, 'mock stdout', '');
        return {} as any;
    }) as any;
    mockFsForPipeline();

    const { runPipelineCommand } = await import('./pipeline-commands.js');

    try {
        const result = await runPipelineCommand('generate', ['--batch', '--resume']);
        assert.ok(result.jobId);
        assert.ok(result.command.includes('--batch'));
        assert.ok(result.command.includes('--resume'));
        assert.ok(result.command.startsWith('npm run generate'));
    } finally {
        (cp as any).exec = origExec;
        restoreFs();
    }
});

test('runPipelineCommand: args with shell metacharacters do NOT bypass allowlist', async () => {
    const { runPipelineCommand } = await import('./pipeline-commands.js');

    await assert.rejects(
        () => runPipelineCommand('generate; rm -rf /', ['--flag']),
        { message: /not whitelisted/ },
    );
});

test('runPipelineCommand: each allowed command works with no args', async () => {
    (cp as any).exec = ((cmd: string, _opts: any, cb?: any) => {
        if (typeof cb === 'function') cb(null, 'output', '');
        return {} as any;
    }) as any;
    mockFsForPipeline();

    const { runPipelineCommand } = await import('./pipeline-commands.js');

    try {
        for (const cmd of ALLOWED) {
            const result = await runPipelineCommand(cmd);
            assert.ok(result.jobId, `no-args call should succeed for "${cmd}"`);
        }
    } finally {
        (cp as any).exec = origExec;
        restoreFs();
    }
});

test('runPipelineCommand: returns { jobId, command } shape', async () => {
    (cp as any).exec = ((cmd: string, _opts: any, cb?: any) => {
        if (typeof cb === 'function') cb(null, 'ok', '');
        return {} as any;
    }) as any;
    mockFsForPipeline();

    const { runPipelineCommand } = await import('./pipeline-commands.js');

    try {
        const result = await runPipelineCommand('generate');
        assert.equal(typeof result.jobId, 'string');
        assert.equal(typeof result.command, 'string');
        assert.ok(result.jobId.length > 0);
        assert.ok(result.command.length > 0);
    } finally {
        (cp as any).exec = origExec;
        restoreFs();
    }
});

test('runPipelineCommand: executes the correct npm run command', async () => {
    (cp as any).exec = ((cmd: string, _opts: any, cb?: any) => {
        if (typeof cb === 'function') cb(null, 'done', '');
        return {} as any;
    }) as any;
    mockFsForPipeline();

    const { runPipelineCommand } = await import('./pipeline-commands.js');

    try {
        const result = await runPipelineCommand('remotion:render', ['vid-1']);
        assert.equal(result.command, 'npm run remotion:render -- vid-1');
    } finally {
        (cp as any).exec = origExec;
        restoreFs();
    }
});
