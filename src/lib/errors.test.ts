import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError, NotFoundError, BadRequestError, isAppError } from './errors';

test('AppError sets properties correctly', () => {
    const err = new AppError('Test error', 400, 'test_error', { field: 'name' });
    assert.equal(err.message, 'Test error');
    assert.equal(err.statusCode, 400);
    assert.equal(err.code, 'test_error');
    assert.deepEqual(err.details, { field: 'name' });
    assert.equal(err.expose, true);
    assert.equal(err.name, 'AppError');
});

test('NotFoundError defaults', () => {
    const err = new NotFoundError();
    assert.equal(err.statusCode, 404);
    assert.equal(err.code, 'not_found');
    assert.equal(err.message, 'Resource not found.');
});

test('NotFoundError custom message', () => {
    const err = new NotFoundError('Video not found.');
    assert.equal(err.message, 'Video not found.');
});

test('BadRequestError properties', () => {
    const err = new BadRequestError('Invalid script format', { line: 5 });
    assert.equal(err.statusCode, 400);
    assert.equal(err.code, 'bad_request');
    assert.deepEqual(err.details, { line: 5 });
});

test('isAppError returns true for AppError instances', () => {
    assert.equal(isAppError(new AppError('test')), true);
    assert.equal(isAppError(new NotFoundError()), true);
    assert.equal(isAppError(new BadRequestError()), true);
});

test('isAppError returns false for non-AppError', () => {
    assert.equal(isAppError(new Error('test')), false);
    assert.equal(isAppError('string error'), false);
    assert.equal(isAppError(null), false);
    assert.equal(isAppError(undefined), false);
});
