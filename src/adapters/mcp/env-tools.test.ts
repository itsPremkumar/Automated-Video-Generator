import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

/**
 * env-tools.test.ts
 *
 * Tests env variable reading tools — masking, update, system info, health check.
 * Uses mock.module() at the top level to intercept fs, child_process, and paths.
 */

// ---------------------------------------------------------------------------
// Module-level mocks — set up before any dynamic import
// ---------------------------------------------------------------------------
// We use a per-test mock.module override pattern via test-scoped mocks.
// Since mock.module needs to be called BEFORE the module is loaded, each test
// group that needs a different mock setup calls mock.module at the top of its
// test group (via beforeEach or by loading the module inside the test).

// ---------------------------------------------------------------------------
// readEnvConfig
// ---------------------------------------------------------------------------
test('readEnvConfig: returns empty object when .env does not exist', async (t) => {
    mock.module('fs', {
        namedExports: {
            existsSync: () => false,
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (..._segments: string[]) => '/tmp/test-project/.env',
        },
    });

    const { readEnvConfig } = await import('./env-tools.js');
    const result = await readEnvConfig();
    assert.deepEqual(result, {});
});

test('readEnvConfig: masks secret-shaped values (KEY, SECRET, PASSWORD, TOKEN, AUTH)', async () => {
    const envContent = [
        'OPENAI_API_KEY=sk-abc123xyz456',
        'DATABASE_PASSWORD=s3cret!pass',
        'AUTH_TOKEN=eyJhbGciOiJIUzI1NiJ9',
        'NORMAL_VAR=hello-world',
        'APP_SECRET=my-app-secret-value',
        'DB_HOST=localhost',
    ].join('\n');

    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => envContent,
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (..._segments: string[]) => '/tmp/test-project/.env',
        },
    });

    const { readEnvConfig } = await import('./env-tools.js');
    const result = await readEnvConfig();

    // Secret keys should be masked (first 4 + '****' + last 4)
    assert.ok(result.OPENAI_API_KEY!.startsWith('sk-a'));
    assert.ok(result.OPENAI_API_KEY!.endsWith('456'));
    assert.ok(result.OPENAI_API_KEY!.includes('****'));

    assert.ok(result.DATABASE_PASSWORD!.startsWith('s3cr'));
    assert.ok(result.DATABASE_PASSWORD!.endsWith('pass'));
    assert.ok(result.DATABASE_PASSWORD!.includes('****'));

    assert.ok(result.AUTH_TOKEN!.startsWith('eyJh'));
    assert.ok(result.AUTH_TOKEN!.endsWith('J9'));

    assert.ok(result.APP_SECRET!.includes('****'));

    // Non-secret values appear in full
    assert.equal(result.NORMAL_VAR, 'hello-world');
    assert.equal(result.DB_HOST, 'localhost');
});

test('readEnvConfig: keys partially matching secret pattern get masked', async () => {
    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => 'MY_KEY_HOLDER=exposed-value',
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (..._segments: string[]) => '/tmp/test-project/.env',
        },
    });

    const { readEnvConfig } = await import('./env-tools.js');
    const result = await readEnvConfig();

    assert.ok(result.MY_KEY_HOLDER!.includes('****'));
});

test('readEnvConfig: ignores _showSecrets parameter (always masks)', async () => {
    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => 'DB_PASSWORD=real-password-value',
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (..._segments: string[]) => '/tmp/test-project/.env',
        },
    });

    const { readEnvConfig } = await import('./env-tools.js');
    const result = await readEnvConfig(true);

    assert.ok(result.DB_PASSWORD!.includes('****'));
});

test('readEnvConfig: masking preserves last-4 characters for short values', async () => {
    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => 'TOKEN=abc',
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (..._segments: string[]) => '/tmp/test-project/.env',
        },
    });

    const { readEnvConfig } = await import('./env-tools.js');
    const result = await readEnvConfig();

    assert.equal(result.TOKEN, 'ab****bc');
});

// ---------------------------------------------------------------------------
// updateEnvConfig
// ---------------------------------------------------------------------------
test('updateEnvConfig: adds new key-value pair when key not present', async () => {
    let writtenContent = '';
    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => 'EXISTING_KEY=old-value\n',
            writeFileSync: (_path: string, content: string) => { writtenContent = content; },
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (..._segments: string[]) => '/tmp/test-project/.env',
        },
    });

    const { updateEnvConfig } = await import('./env-tools.js');
    const result = await updateEnvConfig('NEW_KEY', 'new-value');

    assert.equal(result, true);
    assert.ok(writtenContent.includes('NEW_KEY=new-value'));
    assert.ok(writtenContent.includes('EXISTING_KEY=old-value'));
});

test('updateEnvConfig: updates existing key-value pair', async () => {
    let writtenContent = '';
    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => 'MY_KEY=old-value\nOTHER=keep\n',
            writeFileSync: (_path: string, content: string) => { writtenContent = content; },
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (..._segments: string[]) => '/tmp/test-project/.env',
        },
    });

    const { updateEnvConfig } = await import('./env-tools.js');
    const result = await updateEnvConfig('MY_KEY', 'new-value');

    assert.equal(result, true);
    assert.ok(writtenContent.includes('MY_KEY=new-value'));
    assert.ok(writtenContent.includes('OTHER=keep'));
    assert.ok(!writtenContent.includes('MY_KEY=old-value'));
});

test('updateEnvConfig: creates file if it does not exist', async () => {
    let writtenContent = '';
    mock.module('fs', {
        namedExports: {
            existsSync: () => false,
            writeFileSync: (_path: string, content: string) => { writtenContent = content; },
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (..._segments: string[]) => '/tmp/test-project/.env',
        },
    });

    const { updateEnvConfig } = await import('./env-tools.js');
    const result = await updateEnvConfig('BRAND_NEW', 'value');

    assert.equal(result, true);
    assert.ok(writtenContent.includes('BRAND_NEW=value'));
});

test('updateEnvConfig: preserves other lines when updating key', async () => {
    let writtenContent = '';
    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => 'A=1\nMY_KEY=old\nB=2\n',
            writeFileSync: (_path: string, content: string) => { writtenContent = content; },
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (..._segments: string[]) => '/tmp/test-project/.env',
        },
    });

    const { updateEnvConfig } = await import('./env-tools.js');
    await updateEnvConfig('MY_KEY', 'new');

    assert.ok(writtenContent.includes('A=1\n'));
    assert.ok(writtenContent.includes('\nB=2'));
});

// ---------------------------------------------------------------------------
// getSystemInfo
// ---------------------------------------------------------------------------
test('getSystemInfo: returns info object with expected fields', async () => {
    mock.module('child_process', {
        namedExports: {
            execSync: (cmd: string) => {
                if (cmd.includes('npm')) return Buffer.from('10.8.0\n');
                if (cmd.includes('ffmpeg')) return Buffer.from('ffmpeg version 7.1\n');
                return Buffer.from('');
            },
        },
    });
    // getSystemInfo also uses process.version, process.platform, process.arch
    // which are real — no mocking needed

    const { getSystemInfo } = await import('./env-tools.js');
    const info = await getSystemInfo();

    assert.equal(typeof info.node, 'string');
    assert.ok(info.node!.length > 0);
    assert.equal(info.npm, '10.8.0');
    assert.ok(info.ffmpeg!.includes('ffmpeg'));
    assert.equal(typeof info.platform, 'string');
    assert.equal(typeof info.arch, 'string');
});

test('getSystemInfo: handles execSync failures gracefully', async () => {
    mock.module('child_process', {
        namedExports: {
            execSync: () => { throw new Error('command not found'); },
        },
    });

    const { getSystemInfo } = await import('./env-tools.js');
    const info = await getSystemInfo();

    assert.equal(typeof info.node, 'string');
    assert.equal(info.npm, undefined);
    assert.equal(info.ffmpeg, undefined);
    assert.equal(typeof info.platform, 'string');
    assert.equal(typeof info.arch, 'string');
});

// ---------------------------------------------------------------------------
// healthCheck
// ---------------------------------------------------------------------------
test('healthCheck: returns correct check results', async () => {
    mock.module('fs', {
        namedExports: {
            existsSync: (p: string) => {
                if (typeof p === 'string') {
                    if (p.includes('.env')) return true;
                    if (p.includes('input')) return true;
                    if (p.includes('output')) return false;
                    if (p.includes('public')) return true;
                }
                return false;
            },
        },
    });
    mock.module('child_process', {
        namedExports: {
            execSync: () => Buffer.from('ffmpeg version 7.1'),
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (...segments: string[]) => '/tmp/test-project/' + segments.join('/'),
        },
    });

    const { healthCheck } = await import('./env-tools.js');
    const checks = await healthCheck();

    assert.equal(checks.envFile, true);
    assert.equal(checks.inputDir, true);
    assert.equal(checks.outputDir, false);
    assert.equal(checks.publicDir, true);
    assert.equal(checks.ffmpeg, true);
});

test('healthCheck: ffmpeg check fails gracefully when execSync throws', async () => {
    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
        },
    });
    mock.module('child_process', {
        namedExports: {
            execSync: () => { throw new Error('ffmpeg not found'); },
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (...segments: string[]) => '/tmp/test-project/' + segments.join('/'),
        },
    });

    const { healthCheck } = await import('./env-tools.js');
    const checks = await healthCheck();

    assert.equal(checks.ffmpeg, false);
    assert.equal(checks.envFile, true);
    assert.equal(checks.inputDir, true);
});
