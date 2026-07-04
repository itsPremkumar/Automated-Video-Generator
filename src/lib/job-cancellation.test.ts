import assert from 'node:assert/strict';
import test from 'node:test';
import { JobCancellationError, isJobCancellationError } from './job-cancellation';

test('JobCancellationError sets correct properties', () => {
  const err = new JobCancellationError('Job was cancelled by the user.');
  assert.equal(err.message, 'Job was cancelled by the user.');
  assert.equal(err.name, 'JobCancellationError');
});

test('JobCancellationError is instance of Error', () => {
  const err = new JobCancellationError('job_abc123');
  assert.ok(err instanceof Error);
});

test('isJobCancellationError returns true for JobCancellationError', () => {
  assert.equal(isJobCancellationError(new JobCancellationError('job_1')), true);
});

test('isJobCancellationError returns false for regular Error', () => {
  assert.equal(isJobCancellationError(new Error('test')), false);
});

test('isJobCancellationError returns false for non-Error values', () => {
  assert.equal(isJobCancellationError(null), false);
  assert.equal(isJobCancellationError(undefined), false);
  assert.equal(isJobCancellationError('string'), false);
  assert.equal(isJobCancellationError(42), false);
});
