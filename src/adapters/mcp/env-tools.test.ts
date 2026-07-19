import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

/**
 * env-tools.test.ts
 *
 * Tests env variable reading tools — masking, update, system info, health check.
 *
 * IMPORTANT (Node 22 mock API constraint):
 *   mock.module() for a given specifier can only be registered ONCE per process.
 *   There is no mock.resetModules() in this Node version and restoreAll() does
 *   NOT free a module mock for re-registration. So we register each mock exactly
 *   ONCE at module top-level, with a mutable STATE object that the mock closure
 *   reads at call time. Each test mutates STATE before calling the SUT. Because
 *   the SUT calls fs/child_process/paths inside the functions (call time, not
 *   module-load time), the cached module picks up the current STATE correctly.
 */

// ---------------------------------------------------------------------------
// Single-registration mocks with mutable state
// ---------------------------------------------------------------------------
const fsState: {
    existsImpl: (p: string) => boolean;
    readImpl: () => string;
    writeImpl: (content: string) => void;
} = {
    existsImpl: () => false,
    readImpl: () => '',
    writeImpl: () => {},
};

const cpState: {
    execImpl: (cmd: string) => Buffer;
} = {
    execImpl: (cmd: string) => {
        if (cmd.includes('npm')) return Buffer.from('10.8.0\n');
        if (cmd.includes('ffmpeg')) return Buffer.from('ffmpeg version 7.1\n');
        return Buffer.from('');
    },
};

const pathState: {
    resolveImpl: (...segments: string[]) => string;
} = {
    resolveImpl: (...segments: string[]) => '/tmp/test-project/' + segments.join('/'),
};

mock.module('fs', {
    namedExports: {
        existsSync: (p: string) => fsState.existsImpl(p),
        readFileSync: () => fsState.readImpl(),
        writeFileSync: (_path: string, content: string) => fsState.writeImpl(content),
    },
});

mock.module('child_process', {
    namedExports: {
        execSync: (cmd: string) => cpState.execImpl(cmd),
    },
});

mock.module('../../shared/runtime/paths', {
    namedExports: {
        resolveProjectPath: (...segments: string[]) => pathState.resolveImpl(...segments),
    },
});

// ---------------------------------------------------------------------------
// readEnvConfig
// ---------------------------------------------------------------------------
test('readEnvConfig: returns empty object when .env does not exist', async () => {
    fsState.existsImpl = () => false;
    const { readEnvConfig } = await import('./env-tools.js');
    const result = await readEnvConfig();
    assert.deepEqual(result, {});
});

test('readEnvConfig: masks secret-shaped values (KEY, SECRET, PASSWORD, TOKEN, AUTH)', async () => {
    fsState.existsImpl = () => true;
    fsState.readImpl = () =>
        [
            'OPENAI_API_KEY=sk-abc1234567890abcd',
            'DATABASE_PASSWORD=s3cret!pass',
            'AUTH_TOKEN=eyJhbGciOiJIUzI1NiJ9',
            'NORMAL_VAR=hello-world',
            'APP_SECRET=my-app-secret-value',
            'DB_HOST=localhost',
        ].join('\n');

    const { readEnvConfig } = await import('./env-tools.js');
    const result = await readEnvConfig();

    // Masking format is first4 + '****' + last4
    assert.equal(result.OPENAI_API_KEY, 'sk-a****abcd');
    assert.equal(result.DATABASE_PASSWORD, 's3cr****pass');
    assert.equal(result.AUTH_TOKEN, 'eyJh****NiJ9');
    assert.ok(result.APP_SECRET!.includes('****'));

    // Non-secret values appear in full
    assert.equal(result.NORMAL_VAR, 'hello-world');
    assert.equal(result.DB_HOST, 'localhost');
});

test('readEnvConfig: keys partially matching secret pattern get masked', async () => {
    fsState.existsImpl = () => true;
    fsState.readImpl = () => 'MY_KEY_HOLDER=exposed-value';

    const { readEnvConfig } = await import('./env-tools.js');
    const result = await readEnvConfig();

    assert.ok(result.MY_KEY_HOLDER!.includes('****'));
});

test('readEnvConfig: ignores _showSecrets parameter (always masks)', async () => {
    fsState.existsImpl = () => true;
    fsState.readImpl = () => 'DB_PASSWORD=real-password-value';

    const { readEnvConfig } = await import('./env-tools.js');
    const result = await readEnvConfig(true);

    assert.ok(result.DB_PASSWORD!.includes('****'));
});

test('readEnvConfig: masking preserves last-4 characters for short values', async () => {
    fsState.existsImpl = () => true;
    fsState.readImpl = () => 'TOKEN=abc';

    const { readEnvConfig } = await import('./env-tools.js');
    const result = await readEnvConfig();

    // TOKEN=abc is length 3 (<=4) so it is fully masked to '****' (never leaks the secret)
    assert.equal(result.TOKEN, '****');
});

// ---------------------------------------------------------------------------
// updateEnvConfig
// ---------------------------------------------------------------------------
test('updateEnvConfig: adds new key-value pair when key not present', async () => {
    let writtenContent = '';
    fsState.existsImpl = () => true;
    fsState.readImpl = () => 'EXISTING_KEY=old-value\n';
    fsState.writeImpl = (content: string) => {
        writtenContent = content;
    };

    const { updateEnvConfig } = await import('./env-tools.js');
    const result = await updateEnvConfig('NEW_KEY', 'new-value');

    assert.equal(result, true);
    assert.ok(writtenContent.includes('NEW_KEY=new-value'));
    assert.ok(writtenContent.includes('EXISTING_KEY=old-value'));
});

test('updateEnvConfig: updates existing key-value pair', async () => {
    let writtenContent = '';
    fsState.existsImpl = () => true;
    fsState.readImpl = () => 'MY_KEY=old-value\nOTHER=keep\n';
    fsState.writeImpl = (content: string) => {
        writtenContent = content;
    };

    const { updateEnvConfig } = await import('./env-tools.js');
    const result = await updateEnvConfig('MY_KEY', 'new-value');

    assert.equal(result, true);
    assert.ok(writtenContent.includes('MY_KEY=new-value'));
    assert.ok(writtenContent.includes('OTHER=keep'));
    assert.ok(!writtenContent.includes('MY_KEY=old-value'));
});

test('updateEnvConfig: creates file if it does not exist', async () => {
    let writtenContent = '';
    fsState.existsImpl = () => false;
    fsState.writeImpl = (content: string) => {
        writtenContent = content;
    };

    const { updateEnvConfig } = await import('./env-tools.js');
    const result = await updateEnvConfig('BRAND_NEW', 'value');

    assert.equal(result, true);
    assert.ok(writtenContent.includes('BRAND_NEW=value'));
});

test('updateEnvConfig: preserves other lines when updating key', async () => {
    let writtenContent = '';
    fsState.existsImpl = () => true;
    fsState.readImpl = () => 'A=1\nMY_KEY=old\nB=2\n';
    fsState.writeImpl = (content: string) => {
        writtenContent = content;
    };

    const { updateEnvConfig } = await import('./env-tools.js');
    await updateEnvConfig('MY_KEY', 'new');

    assert.ok(writtenContent.includes('A=1\n'));
    assert.ok(writtenContent.includes('\nB=2'));
});

// ---------------------------------------------------------------------------
// getSystemInfo
// ---------------------------------------------------------------------------
test('getSystemInfo: returns info object with expected fields', async () => {
    cpState.execImpl = (cmd: string) => {
        if (cmd.includes('npm')) return Buffer.from('10.8.0\n');
        if (cmd.includes('ffmpeg')) return Buffer.from('ffmpeg version 7.1\n');
        return Buffer.from('');
    };

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
    cpState.execImpl = () => {
        throw new Error('command not found');
    };

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
    fsState.existsImpl = (p: string) => {
        if (typeof p === 'string') {
            if (p.includes('.env')) return true;
            if (p.includes('input')) return true;
            if (p.includes('output')) return false;
            if (p.includes('public')) return true;
        }
        return false;
    };
    cpState.execImpl = () => Buffer.from('ffmpeg version 7.1');

    const { healthCheck } = await import('./env-tools.js');
    const checks = await healthCheck();

    assert.equal(checks.envFile, true);
    assert.equal(checks.inputDir, true);
    assert.equal(checks.outputDir, false);
    assert.equal(checks.publicDir, true);
    assert.equal(checks.ffmpeg, true);
});

test('healthCheck: ffmpeg check fails gracefully when execSync throws', async () => {
    fsState.existsImpl = () => true;
    cpState.execImpl = () => {
        throw new Error('ffmpeg not found');
    };

    const { healthCheck } = await import('./env-tools.js');
    const checks = await healthCheck();

    assert.equal(checks.ffmpeg, false);
    assert.equal(checks.envFile, true);
    assert.equal(checks.inputDir, true);
});
