import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveContentType, toEditableEnvUpdates, toSceneIndex } from './api-helpers';

test('toSceneIndex parses valid indices and rejects invalid ones', () => {
    assert.equal(toSceneIndex('3'), 3);
    assert.throws(() => toSceneIndex('-1'));
    assert.throws(() => toSceneIndex('abc'));
});

test('resolveContentType maps supported extensions', () => {
    assert.equal(resolveContentType('.mp4'), 'video/mp4');
    assert.equal(resolveContentType('.png'), 'image/png');
    assert.equal(resolveContentType('.unknown'), null);
});

test('toEditableEnvUpdates keeps only editable populated string values', () => {
    const updates = toEditableEnvUpdates(
        {
            PEXELS_API_KEY: 'abc',
            GEMINI_API_KEY: '',
            RANDOM_KEY: 'skip-me',
        },
        ['PEXELS_API_KEY', 'GEMINI_API_KEY'],
    );

    assert.deepEqual(updates, {
        PEXELS_API_KEY: 'abc',
    });
});
