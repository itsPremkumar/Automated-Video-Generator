import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flux3Mode, flux3Aspect, flux3PromptForScene, flux3Duration } from './flux3-option.js';

test('flux3Mode: absent field defaults to off (pipeline unchanged)', () => {
    assert.equal(flux3Mode({}), 'off');
    assert.equal(flux3Mode({ flux3: 'off' }), 'off');
    assert.equal(flux3Mode({ flux3: 'bogus' }), 'off');
});

test('flux3Mode: auto and on are honored', () => {
    assert.equal(flux3Mode({ flux3: 'auto' }), 'auto');
    assert.equal(flux3Mode({ flux3: 'on' }), 'on');
});

test('flux3Aspect maps orientations to FLUX 3 aspect ratios', () => {
    assert.equal(flux3Aspect('portrait'), '9:16');
    assert.equal(flux3Aspect('square'), '1:1');
    assert.equal(flux3Aspect('landscape'), '16:9');
    assert.equal(flux3Aspect(undefined), '16:9');
    assert.equal(flux3Aspect('4k'), '16:9'); // unknown → safe default
});

test('flux3PromptForScene: per-scene override wins, then narration, then keywords', () => {
    const scene = (voiceoverText: string, searchKeywords: string[]) => ({
        sceneNumber: 2,
        voiceoverText,
        searchKeywords,
    });
    // override array aligned to scene index (0-based): scene 2 → index 1
    assert.equal(
        flux3PromptForScene(scene('narrated line', ['red', 'fox']), ['first', 'OVERRIDE'], 1, 'fallback'),
        'OVERRIDE',
    );
    // no override → narration
    assert.equal(
        flux3PromptForScene(scene('narrated line', ['red', 'fox']), [], 1, 'fallback'),
        'narrated line',
    );
    // no narration → keywords joined
    assert.equal(
        flux3PromptForScene(scene('', ['red', 'fox']), [], 1, 'fallback'),
        'red, fox',
    );
    // nothing → title fallback
    assert.equal(flux3PromptForScene(scene('', []), [], 1, 'fallback'), 'fallback');
});

test('flux3Duration clamps to the FLUX 3 5..20s window', () => {
    const d = (sec: number) => flux3Duration(sec);
    assert.equal(d(3), 5);
    assert.equal(d(8.4), 8);
    assert.equal(d(30), 20);
    assert.equal(d(undefined as unknown as number), 8);
});
