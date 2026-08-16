/**
 * transitions.test.ts — Tests for video transition effects.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('transitions listTransitionEffects returns all effects', async () => {
    const { listTransitionEffects, getTransitionConfig } = await import('../src/lib/transitions/effects.js');
    const effects = listTransitionEffects();
    assert.ok(effects.length >= 5, 'has at least 5 effects');
    assert.ok(effects.includes('fade'), 'includes fade');
    assert.ok(effects.includes('glitch'), 'includes glitch');
    assert.ok(effects.includes('lightleak'), 'includes lightleak');
    assert.ok(effects.includes('whippan'), 'includes whippan');

    const fade = getTransitionConfig('fade');
    assert.equal(fade.name, 'Fade', 'fade name');
    assert.ok(fade.duration > 0, 'fade has duration');
});

test('transitions generateXfadeFilter produces valid filter', async () => {
    const { generateXfadeFilter } = await import('../src/lib/transitions/effects.js');
    const filter = generateXfadeFilter('dissolve', 1.0, 4.0);
    assert.ok(filter.includes('xfade='), 'has xfade');
    assert.ok(filter.includes('dissolve'), 'includes dissolve');
});

test('transitions generateGlitchFilter works', async () => {
    const { generateGlitchFilter } = await import('../src/lib/transitions/effects.js');
    const filter = generateGlitchFilter(1.0);
    assert.ok(filter.includes('noise='), 'has noise');
    assert.ok(filter.includes('brightness='), 'has brightness');
});

test('transitions generateLightLeakFilter works', async () => {
    const { generateLightLeakFilter } = await import('../src/lib/transitions/effects.js');
    const filter = generateLightLeakFilter();
    assert.ok(filter.includes('colorchannelmixer='), 'has colorchannelmixer');
});

test('transitions generateWhipPanFilter works', async () => {
    const { generateWhipPanFilter } = await import('../src/lib/transitions/effects.js');
    const filter = generateWhipPanFilter();
    assert.ok(filter.includes('minterpolate='), 'has minterpolate');
});

test('transitions generateZoomBlurFilter works', async () => {
    const { generateZoomBlurFilter } = await import('../src/lib/transitions/effects.js');
    const filter = generateZoomBlurFilter(1080, 1920);
    assert.ok(filter.includes('zoompan='), 'has zoompan');
    assert.ok(filter.includes('1080'), 'includes width');
});

test('transitions generateSlideFilter works', async () => {
    const { generateSlideFilter } = await import('../src/lib/transitions/effects.js');
    const filter = generateSlideFilter('left');
    assert.ok(filter.includes('slideleft'), 'includes slideleft');
});

test('transitions generateFadeFilter works', async () => {
    const { generateFadeFilter } = await import('../src/lib/transitions/effects.js');
    const filter = generateFadeFilter(1.0, 0);
    assert.ok(filter.includes('fade=t=in'), 'has fade in');
    assert.ok(filter.includes('fade=t=out'), 'has fade out');
});

test('transitions buildTransitionChain works', async () => {
    const { buildTransitionChain } = await import('../src/lib/transitions/effects.js');
    const chain = buildTransitionChain('fade', 5, 1080, 1920);
    assert.ok(chain.length > 0, 'has filter chain');

    const none = buildTransitionChain('none', 5, 1080, 1920);
    assert.equal(none, '', 'none returns empty');
});
