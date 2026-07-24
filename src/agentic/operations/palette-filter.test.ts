import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPaletteFilter } from './compose';

test('buildPaletteFilter maps known presets to real ffmpeg filters', () => {
    assert.match(buildPaletteFilter('warm'), /colortemperature/);
    assert.match(buildPaletteFilter('cool'), /colortemperature/);
    assert.match(buildPaletteFilter('blue'), /colorbalance/);
    assert.match(buildPaletteFilter('teal'), /colorbalance/);
    assert.match(buildPaletteFilter('cyberpunk'), /colorbalance/);
    assert.match(buildPaletteFilter('vintage'), /colorbalance/);
    assert.match(buildPaletteFilter('cinematic'), /eq=/);
});

test('buildPaletteFilter is case-insensitive and trims', () => {
    assert.equal(buildPaletteFilter('WARM'), buildPaletteFilter('warm'));
    assert.match(buildPaletteFilter('  blue  '), /colorbalance/);
});

test('buildPaletteFilter returns empty for unknown/empty', () => {
    assert.equal(buildPaletteFilter('nonsense'), '');
    assert.equal(buildPaletteFilter(''), '');
    assert.equal(buildPaletteFilter(undefined), '');
});
