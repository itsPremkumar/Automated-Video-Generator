import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapCaption, estimateTextWidth } from './compose';

test('wrapCaption wraps a long line to fit maxW', () => {
    const size = 40;
    const maxW = 500; // narrow frame
    const long = 'The ocean stretches all the way to the distant horizon under a pale sky';
    const lines = wrapCaption(long, size, maxW);
    assert.ok(lines.length >= 2, 'expected >=2 wrapped lines');
    for (const l of lines) assert.ok(estimateTextWidth(l, size) <= maxW, `line overflows: "${l}"`);
});

test('wrapCaption returns single line when it fits', () => {
    const lines = wrapCaption('Short caption', 40, 500);
    assert.equal(lines.length, 1);
});

test('wrapCaption never returns empty for non-empty input', () => {
    const lines = wrapCaption('hello', 40, 1); // absurdly small width
    assert.ok(lines.length >= 1 && lines.join(' ').length > 0);
});

test('estimateTextWidth scales linearly with size', () => {
    assert.ok(estimateTextWidth('abc', 80) > estimateTextWidth('abc', 40));
});
