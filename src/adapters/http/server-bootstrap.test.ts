import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

test('server-bootstrap shouldExportExpressApp', async () => {
  // --- Mocks ---
  const mockListen = mock.fn(
    (port: number, host: string, cb?: () => void) => {
      if (cb) setImmediate(cb);
      return {
        on: (_event: string, _handler: (...args: unknown[]) => void) => ({
          on: () => {},
        }),
      };
    },
  );

  const mockApp = {
    listen: mockListen,
    use: () => {},
    get: () => {},
    post: () => {},
    delete: () => {},
    set: () => {},
    disable: () => {},
  };

  mock.module('../../constants/config', {
    namedExports: { HOST: '127.0.0.1', PORT: 3001 },
  });

  mock.module('../../agentic/operations/security.js', {
    namedExports: { redactSecrets: (s: string) => s },
  });

  mock.module('../../app', {
    defaultExport: mockApp,
    namedExports: { expressApp: mockApp },
  });

  mock.module('child_process', {
    namedExports: { exec: mock.fn() },
  });

  // --- Import ---
  const mod = await import('./server-bootstrap.js');

  // --- Assert ---
  assert.ok(mod.expressApp, 'expressApp should be exported');
  assert.strictEqual(mod.expressApp, mockApp, 'expressApp should be the mocked app');
});

test('server-bootstrap shouldAutoStartServer defaults to shouldStart=true', async () => {
  mock.module('../../constants/config', {
    namedExports: { HOST: '127.0.0.1', PORT: 3001 },
  });
  mock.module('../../agentic/operations/security.js', {
    namedExports: { redactSecrets: (s: string) => s },
  });
  mock.module('../../app', {
    defaultExport: { listen: () => ({ on: () => {} }), use: () => {} },
    namedExports: { expressApp: { listen: () => ({ on: () => {} }), use: () => {} } },
  });
  mock.module('child_process', { namedExports: { exec: mock.fn() } });

  const mod = await import('./server-bootstrap.js');

  const result = mod.shouldAutoStartServer();
  assert.ok(result.shouldStart, 'shouldStart should be true in normal env');
  assert.equal(result.isBackgroundWorker, false, 'isBackgroundWorker should be false');
});

test('server-bootstrap shouldAutoStartServer returns false in Electron main', async () => {
  // Simulate Electron main process
  Object.defineProperty(process.versions, 'electron', {
    value: '28.0.0',
    configurable: true,
    writable: true,
  });
  delete process.env.ELECTRON_BACKEND_SERVER;

  mock.module('../../constants/config', {
    namedExports: { HOST: '127.0.0.1', PORT: 3001 },
  });
  mock.module('../../agentic/operations/security.js', {
    namedExports: { redactSecrets: (s: string) => s },
  });
  mock.module('../../app', {
    defaultExport: { listen: () => ({ on: () => {} }), use: () => {} },
    namedExports: { expressApp: { listen: () => ({ on: () => {} }), use: () => {} } },
  });
  mock.module('child_process', { namedExports: { exec: mock.fn() } });

  const mod = await import('./server-bootstrap.js');

  const result = mod.shouldAutoStartServer();
  assert.equal(result.shouldStart, false, 'shouldStart should be false in Electron main');
  assert.equal(result.isBackgroundWorker, false, 'isBackgroundWorker should be false');

  // Clean up – remove the electron version so later tests are not affected
  delete (process.versions as any).electron;
});

test('server-bootstrap shouldAutoStartServer sets isBackgroundWorker with ELECTRON_BACKEND_SERVER', async () => {
  process.env.ELECTRON_BACKEND_SERVER = '1';

  mock.module('../../constants/config', {
    namedExports: { HOST: '127.0.0.1', PORT: 3001 },
  });
  mock.module('../../agentic/operations/security.js', {
    namedExports: { redactSecrets: (s: string) => s },
  });
  mock.module('../../app', {
    defaultExport: { listen: () => ({ on: () => {} }), use: () => {} },
    namedExports: { expressApp: { listen: () => ({ on: () => {} }), use: () => {} } },
  });
  mock.module('child_process', { namedExports: { exec: mock.fn() } });

  const mod = await import('./server-bootstrap.js');

  const result = mod.shouldAutoStartServer();
  assert.ok(result.shouldStart, 'shouldStart should be true for background worker');
  assert.ok(result.isBackgroundWorker, 'isBackgroundWorker should be true for background worker');

  delete process.env.ELECTRON_BACKEND_SERVER;
});

test('server-bootstrap startServer calls app.listen and resolves', async () => {
  let listenedPort = 0;
  let listenedHost = '';
  let listenCbRef: (() => void) | null = null;

  const mockApp = {
    listen: mock.fn((port: number, host: string, cb?: () => void) => {
      listenedPort = port;
      listenedHost = host;
      listenCbRef = cb || null;
      if (cb) setImmediate(cb);
      return {
        on: (_event: string, handler: (...args: unknown[]) => void) => ({
          on: () => {},
          emit: (event: string, ...args: unknown[]) => {
            handler(...args);
          },
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

  mock.module('../../constants/config', {
    namedExports: { HOST: '127.0.0.1', PORT: 3001 },
  });
  mock.module('../../agentic/operations/security.js', {
    namedExports: { redactSecrets: (s: string) => s },
  });
  // IMPORTANT: a fresh import is needed – use a port path to bust cache
  mock.module('../../app', {
    defaultExport: mockApp,
    namedExports: { expressApp: mockApp },
  });
  mock.module('child_process', { namedExports: { exec: mock.fn() } });

  const mod = await import('./server-bootstrap.js');

  await mod.startServer(3456);
  assert.equal(listenedPort, 3456, 'should listen on the provided port');
  assert.equal(listenedHost, '127.0.0.1', 'should listen on HOST');
  assert.ok(mockApp.listen.mock.calls.length >= 1, 'app.listen should have been called');
});
