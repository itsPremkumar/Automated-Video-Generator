import assert from 'node:assert/strict';
import test from 'node:test';
import { parseScript, validateScript } from './script-parser';

test('validateScript accepts valid script', () => {
    validateScript('This is a valid script with enough length.');
});

test('validateScript accepts script with visual tags', () => {
    validateScript('[Visual: test image]\nNarration text here.');
});

test('validateScript throws on empty script', () => {
    assert.throws(() => {
        validateScript('');
    }, /empty/i);
});

test('validateScript throws on very short script', () => {
    assert.throws(() => {
        validateScript('Hi');
    });
});

test('parseScript returns scenes from script with visual tags', async () => {
    const result = await parseScript(
        '[Visual: mountain landscape]\nThis is scene one.\n\n[Visual: ocean sunset]\nThis is scene two.'
    );

    assert.ok(result.scenes.length >= 2);
    assert.ok(result.totalDuration > 0);
});

test('parseScript returns at least one scene for simple text', async () => {
    const result = await parseScript(
        'This is a simple script without visual tags. It should still produce a video.'
    );

    assert.ok(result.scenes.length >= 1);
    assert.ok(result.totalDuration > 0);
});
