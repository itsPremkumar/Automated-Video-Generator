import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceUnavailableError } from './errors';

// Test the service-unavailable error that ollama-client maps to
test('ServiceUnavailableError sets correct properties', () => {
    const err = new ServiceUnavailableError('Ollama is not running', { provider: 'ollama', statusCode: 503 });
    assert.equal(err.message, 'Ollama is not running');
    assert.equal(err.statusCode, 503);
    assert.equal(err.code, 'service_unavailable');
    assert.deepEqual(err.details, { provider: 'ollama', statusCode: 503 });
});

test('ServiceUnavailableError defaults to 503', () => {
    const err = new ServiceUnavailableError('Service down');
    assert.equal(err.statusCode, 503);
    assert.equal(err.code, 'service_unavailable');
});

test('ServiceUnavailableError with no details defaults to undefined', () => {
    const err = new ServiceUnavailableError('Service down');
    assert.equal(err.details, undefined);
});
