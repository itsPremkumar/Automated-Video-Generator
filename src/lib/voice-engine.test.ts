import assert from 'node:assert/strict';
import test from 'node:test';
import { encodePowerShellCommand, readSpawnOutput, runningInPackagedDesktopMode } from './voice-engine';

test('encodePowerShellCommand encodes UTF-16LE base64', () => {
    const encoded = encodePowerShellCommand('Write-Output "hello"');
    assert.equal(typeof encoded, 'string');
    assert.ok(encoded.length > 0);
    const decoded = Buffer.from(encoded, 'base64').toString('utf16le');
    assert.equal(decoded, 'Write-Output "hello"');
});

test('readSpawnOutput returns empty string for null input', () => {
    assert.equal(readSpawnOutput(null), '');
});

test('readSpawnOutput returns empty string for undefined input', () => {
    assert.equal(readSpawnOutput(undefined), '');
});

test('readSpawnOutput trims string output', () => {
    assert.equal(readSpawnOutput('  hello world  '), 'hello world');
});

test('readSpawnOutput converts Buffer to string and trims', () => {
    const buf = Buffer.from('  trimmed  ', 'utf8');
    assert.equal(readSpawnOutput(buf), 'trimmed');
});

test('readSpawnOutput returns empty string for empty buffer', () => {
    assert.equal(readSpawnOutput(Buffer.alloc(0)), '');
});

test('runningInPackagedDesktopMode returns false when env vars not set', () => {
    const originalBackend = process.env.ELECTRON_BACKEND_SERVER;
    const originalResources = process.env.ELECTRON_RESOURCES_PATH;
    delete process.env.ELECTRON_BACKEND_SERVER;
    delete process.env.ELECTRON_RESOURCES_PATH;
    try {
        assert.equal(runningInPackagedDesktopMode(), false);
    } finally {
        if (originalBackend) process.env.ELECTRON_BACKEND_SERVER = originalBackend;
        if (originalResources) process.env.ELECTRON_RESOURCES_PATH = originalResources;
    }
});

test('runningInPackagedDesktopMode returns true when ELECTRON_BACKEND_SERVER is set', () => {
    const originalBackend = process.env.ELECTRON_BACKEND_SERVER;
    process.env.ELECTRON_BACKEND_SERVER = '1';
    try {
        assert.equal(runningInPackagedDesktopMode(), true);
    } finally {
        if (originalBackend) process.env.ELECTRON_BACKEND_SERVER = originalBackend;
        else delete process.env.ELECTRON_BACKEND_SERVER;
    }
});
