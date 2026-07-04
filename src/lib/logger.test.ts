import assert from 'node:assert/strict';
import test from 'node:test';
import { appLogger } from './logger';

test('appLogger.info works without context', () => {
    appLogger.info('test message');
});

test('appLogger.info works with context', () => {
    appLogger.info('test message', { jobId: '123' });
});

test('appLogger.warn works', () => {
    appLogger.warn('warning message');
});

test('appLogger.error works', () => {
    appLogger.error('error message');
});

test('appLogger.child creates child logger', () => {
    const child = appLogger.child({ requestId: 'abc' });
    assert.ok(child);
    child.info('child message');
});
