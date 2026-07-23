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
        '[Visual: mountain landscape]\nThis is scene one.\n\n[Visual: ocean sunset]\nThis is scene two.',
    );

    assert.ok(result.scenes.length >= 2);
    assert.ok(result.totalDuration > 0);
});

test('parseScript returns at least one scene for simple text', async () => {
    const result = await parseScript('This is a simple script without visual tags. It should still produce a video.');

    assert.ok(result.scenes.length >= 1);
    assert.ok(result.totalDuration > 0);
});

test('parseScript reads the 6 new per-scene inline tags', async () => {
    const result = await parseScript(
        'Intro scene. [CaptionTheme: neon] [Sfx: on] [JCut: 0.4] [Vignette: off] [Kinetic: on] [MusicIntensity: energetic]',
    );

    assert.equal(result.scenes.length, 1);
    const s = result.scenes[0];
    assert.equal(s.captionTheme, 'neon');
    assert.equal(s.sfx, true);
    assert.equal(s.jCutSec, 0.4);
    assert.equal(s.vignette, false);
    assert.equal(s.kineticText, true);
    assert.equal(s.musicIntensity, 'energetic');
});

test('parseScript strips new inline tags from spoken text', async () => {
    const result = await parseScript(
        'Real words here. [CaptionTheme: neon] [Sfx: on] [MusicIntensity: calm]',
    );
    const text = result.scenes[0].voiceoverText;
    assert.ok(!text.includes('[CaptionTheme'));
    assert.ok(!text.includes('[Sfx'));
    assert.ok(!text.includes('[MusicIntensity'));
    assert.ok(text.includes('Real words here.'));
});

test('parseScript boolean tags accept off/false', async () => {
    const result = await parseScript('Scene. [Vignette: false] [Kinetic: off] [Sfx: false]');
    const s = result.scenes[0];
    assert.equal(s.vignette, false);
    assert.equal(s.kineticText, false);
    assert.equal(s.sfx, false);
});
