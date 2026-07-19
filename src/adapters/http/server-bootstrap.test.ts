import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * server-bootstrap.test.ts
 *
 * Node 22 mock API constraint: mock.module() for a given specifier can only be
 * registered ONCE per process (no mock.resetModules(); restoreAll() does NOT free
 * it for re-registration). So every dependency is registered exactly ONCE at
 * top-level with mutable STATE closures. Tests that need different behaviors
 * (electron / background-worker flags) mutate process state, not the module mock.
 *
 * The `app` module is captured at SUT module-load, so a single shared mockApp is
 * used for all tests; startServer() exercises app.listen on that shared app.
 */

// Shared, single-registration mocks -------------------------------------------
const configState: { HOST: string; PORT: number } = { HOST: '127.0.0.1', PORT: 3001 };
const execCalls: string[] = [];

const mockApp = {
    listen: mock.fn((port: number, host: string, cb?: () => void) => {
        if (cb) setImmediate(cb);
        return {
            on: (_event: string, _handler: (...args: unknown[]) => void) => ({
                on: () => {},
            }),
        };
    }),
    use: () => {},
    get: () => {},
    post: () => {},
    delete: () => {},
    set: () => {},
    disable: () => {},
};

mock.module('child_process', {
    namedExports: {
        exec: mock.fn((cmd: string, _opts?: any, cb?: (e: any, out: any, err: any) => void) => {
            execCalls.push(cmd);
            if (typeof cb === 'function') cb(null, Buffer.from(''), Buffer.from(''));
            return {} as any;
        }),
    },
});

mock.module('../../constants/config', {
    namedExports: { get HOST() { return configState.HOST; }, get PORT() { return configState.PORT; } },
});

mock.module('../../agentic/operations/security.js', {
    namedExports: { redactSecrets: (s: string) => s },
});

mock.module('../../app', {
    defaultExport: mockApp,
    namedExports: { expressApp: mockApp },
});

// ---------------------------------------------------------------------------
test('server-bootstrap shouldExportExpressApp', async () => {
    const mod = await import('./server-bootstrap.js');
    assert.ok(mod.expressApp, 'expressApp should be exported');
    assert.strictEqual(mod.expressApp, mockApp, 'expressApp should be the mocked app');
});

test('server-bootstrap shouldAutoStartServer defaults to shouldStart=true', async () => {
    delete (process.versions as any).electron;
    delete process.env.ELECTRON_BACKEND_SERVER;

    const mod = await import('./server-bootstrap.js');
    const result = mod.shouldAutoStartServer();
    assert.ok(result.shouldStart, 'shouldStart should be true in normal env');
    assert.equal(result.isBackgroundWorker, false, 'isBackgroundWorker should be false');
});

test('server-bootstrap shouldAutoStartServer returns false in Electron main', async () => {
    (process.versions as any).electron = '28.0.0';
    delete process.env.ELECTRON_BACKEND_SERVER;

    const mod = await import('./server-bootstrap.js');
    const result = mod.shouldAutoStartServer();
    assert.equal(result.shouldStart, false, 'shouldStart should be false in Electron main');
    assert.equal(result.isBackgroundWorker, false, 'isBackgroundWorker should be false');

    delete (process.versions as any).electron;
});

test('server-bootstrap shouldAutoStartServer sets isBackgroundWorker with ELECTRON_BACKEND_SERVER', async () => {
    process.env.ELECTRON_BACKEND_SERVER = '1';

    const mod = await import('./server-bootstrap.js');
    const result = mod.shouldAutoStartServer();
    assert.ok(result.shouldStart, 'shouldStart should be true for background worker');
    assert.ok(result.isBackgroundWorker, 'isBackgroundWorker should be true for background worker');

    delete process.env.ELECTRON_BACKEND_SERVER;
});

test('server-bootstrap startServer calls app.listen and resolves', async () => {
    const beforeCalls = (mockApp.listen as any).mock.calls.length;
    configState.HOST = '127.0.0.1';
    configState.PORT = 3001;

    const mod = await import('./server-bootstrap.js');
    await mod.startServer(3456);

    assert.ok((mockApp.listen as any).mock.calls.length > beforeCalls, 'app.listen should have been called');
    const lastCall = (mockApp.listen as any).mock.calls[(mockApp.listen as any).mock.calls.length - 1];
    assert.equal(lastCall.arguments[0], 3456, 'should listen on the provided port');
});
