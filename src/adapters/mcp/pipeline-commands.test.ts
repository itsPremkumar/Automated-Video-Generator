import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

/**
 * pipeline-commands.test.ts
 *
 * Tests the security-critical allowlist-based exec() in pipeline-commands.ts.
 *
 * Node 22 mock API constraint: mock.module() for a given specifier can only be
 * registered ONCE per process (no mock.resetModules(); restoreAll() does NOT free
 * it for re-registration). So child_process + fs are registered exactly ONCE at
 * top-level with mutable STATE the closures read at call time. Each test mutates
 * STATE before calling the SUT.
 *
 * NOTE: we must NOT do `(cp as any).exec = ...` / `mock.method(cp, 'exec', ...)` —
 * child_process.exec is a read-only ESM namespace export. mock.module() replaces
 * the whole namespace, which is the supported path.
 */

const ALLOWED = ['generate', 'resume', 'segment', 'remotion:render', 'remotion:studio'];

const execState: { impl: (cmd: string, cb?: (e: any, out: string, err: string) => void) => void } = {
    impl: (cmd: string, cb?: (e: any, out: string, err: string) => void) => {
        if (typeof cb === 'function') cb(null, `mock stdout for ${cmd}`, '');
    },
};

const fsState: { existsImpl: () => boolean; readImpl: () => string; writeImpl: () => void } = {
    existsImpl: () => false,
    readImpl: () => '{}',
    writeImpl: () => {},
};

mock.module('child_process', {
    namedExports: {
        exec: mock.fn((cmd: string, _opts: any, cb?: (e: any, out: string, err: string) => void) => {
            execState.impl(cmd, cb);
            return {} as any;
        }),
    },
});

mock.module('fs', {
    namedExports: {
        existsSync: () => fsState.existsImpl(),
        readFileSync: () => fsState.readImpl(),
        writeFileSync: (_path: string, _content: string) => fsState.writeImpl(),
        renameSync: () => {},
    },
});

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
    await assert.rejects(() => runPipelineCommand(''), { message: /not whitelisted/ });
});

// ---------------------------------------------------------------------------
// Allowed commands — exec + fs mocked to prevent real execution
// ---------------------------------------------------------------------------
test('runPipelineCommand: allowed commands proceed and return correct shape', async () => {
    const execCalls: string[] = [];
    execState.impl = (cmd: string, cb?: (e: any, out: string, err: string) => void) => {
        execCalls.push(cmd);
        if (typeof cb === 'function') cb(null, 'mock stdout', '');
    };
    fsState.existsImpl = () => false;
    fsState.readImpl = () => '{}';
    fsState.writeImpl = () => {};

    const { runPipelineCommand } = await import('./pipeline-commands.js');

    for (const cmd of ALLOWED) {
        const result = await runPipelineCommand(cmd);
        assert.ok(result.jobId, `should return jobId for "${cmd}"`);
        assert.ok(result.jobId.startsWith('exec_'), 'jobId starts with exec_');
        assert.ok(result.command.includes(cmd), 'command includes the npm script');
    }
    assert.equal(execCalls.length, ALLOWED.length, 'every allowed command should have executed');
});

test('runPipelineCommand: allows passing arguments on allowed commands', async () => {
    const execCalls: string[] = [];
    execState.impl = (cmd: string, cb?: (e: any, out: string, err: string) => void) => {
        execCalls.push(cmd);
        if (typeof cb === 'function') cb(null, 'mock stdout', '');
    };
    fsState.existsImpl = () => false;
    fsState.readImpl = () => '{}';
    fsState.writeImpl = () => {};

    const { runPipelineCommand } = await import('./pipeline-commands.js');

    const result = await runPipelineCommand('generate', ['--batch', '--resume']);
    assert.ok(result.jobId);
    assert.ok(result.command.includes('--batch'));
    assert.ok(result.command.includes('--resume'));
    assert.ok(result.command.startsWith('npm run generate'));
});

test('runPipelineCommand: args with shell metacharacters do NOT bypass allowlist', async () => {
    const { runPipelineCommand } = await import('./pipeline-commands.js');
    await assert.rejects(() => runPipelineCommand('generate; rm -rf /', ['--flag']), { message: /not whitelisted/ });
});

test('runPipelineCommand: each allowed command works with no args', async () => {
    const execCalls: string[] = [];
    execState.impl = (cmd: string, cb?: (e: any, out: string, err: string) => void) => {
        execCalls.push(cmd);
        if (typeof cb === 'function') cb(null, 'output', '');
    };
    fsState.existsImpl = () => false;
    fsState.readImpl = () => '{}';
    fsState.writeImpl = () => {};

    const { runPipelineCommand } = await import('./pipeline-commands.js');

    for (const cmd of ALLOWED) {
        const result = await runPipelineCommand(cmd);
        assert.ok(result.jobId, `no-args call should succeed for "${cmd}"`);
    }
    assert.equal(execCalls.length, ALLOWED.length);
});

test('runPipelineCommand: returns { jobId, command } shape', async () => {
    execState.impl = (cmd: string, cb?: (e: any, out: string, err: string) => void) => {
        if (typeof cb === 'function') cb(null, 'ok', '');
    };
    fsState.existsImpl = () => false;
    fsState.readImpl = () => '{}';
    fsState.writeImpl = () => {};

    const { runPipelineCommand } = await import('./pipeline-commands.js');

    const result = await runPipelineCommand('generate');
    assert.equal(typeof result.jobId, 'string');
    assert.equal(typeof result.command, 'string');
    assert.ok(result.jobId.length > 0);
    assert.ok(result.command.length > 0);
});

test('runPipelineCommand: executes the correct npm run command', async () => {
    const execCalls: string[] = [];
    execState.impl = (cmd: string, cb?: (e: any, out: string, err: string) => void) => {
        execCalls.push(cmd);
        if (typeof cb === 'function') cb(null, 'done', '');
    };
    fsState.existsImpl = () => false;
    fsState.readImpl = () => '{}';
    fsState.writeImpl = () => {};

    const { runPipelineCommand } = await import('./pipeline-commands.js');

    const result = await runPipelineCommand('remotion:render', ['vid-1']);
    assert.equal(result.command, 'npm run remotion:render -- vid-1');
});
