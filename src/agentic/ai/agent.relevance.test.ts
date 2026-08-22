import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAssetRelevant } from './agent.js';

test('relevance: gorilla documentary rejected for magma-chamber scene', () => {
    // Real observed failure: "Magma chambers fill deep beneath the surface"
    // → Wikimedia returned "Gorilla in Bwindi Impenetrable Forest.ogv"
    const ok = isAssetRelevant(
        'Gorilla in Bwindi Impenetrable Forest',
        ['magma', 'chambers', 'fill', 'deep', 'beneath', 'surface'],
    );
    assert.equal(ok, false);
});

test('relevance: volcano footage accepted for volcano scene', () => {
    const ok = isAssetRelevant(
        'Volcanic eruption at Kilauea - lava fountain',
        ['volcano', 'eruption', 'lava'],
    );
    assert.equal(ok, true);
});

test('relevance: plural/singular stem match passes (volcano/volcanoes)', () => {
    const ok = isAssetRelevant('Volcanoes of the World', ['volcano', 'lava']);
    assert.equal(ok, true);
});

test('relevance: missing title passes (no signal)', () => {
    assert.equal(isAssetRelevant(undefined, ['volcano']), true);
    assert.equal(isAssetRelevant(null, ['volcano']), true);
    assert.equal(isAssetRelevant('', ['volcano']), true);
});

test('relevance: stopword-only title has no signal → passes', () => {
    // A generic title like "Close up" must not veto an otherwise plausible hit
    assert.equal(isAssetRelevant('Close up', ['volcano']), true);
});

test('relevance: firefighter scene rejected for volcano keywords', () => {
    const ok = isAssetRelevant(
        'Firefighters battling wildfire in forest',
        ['volcanoes', 'shape', 'earth'],
    );
    assert.equal(ok, false);
});
