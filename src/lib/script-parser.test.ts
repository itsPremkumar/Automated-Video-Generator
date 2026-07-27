import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
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

test('B1: multi-clause line with [Visual:] stays ONE scene (no sentence split)', async () => {
    // Self-contained fixtures: parser only binds localAsset when the file EXISTS in input/visuals/
    const visDir = path.join(process.cwd(), 'input', 'visuals');
    fs.mkdirSync(visDir, { recursive: true });
    const fixtures = ['avs_s1_github.png', 'avs_showcase_s0.mp4', 'avs_showcase_s7.mp4'];
    for (const f of fixtures) fs.writeFileSync(path.join(visDir, f), 'x');
    try {
        const result = await parseScript(
            'Meet AVS — an open-source agentic AI video generator — fully autonomous, zero cost, MIT licensed. [Visual: avs_s1_github.png] [Transition: slide] [Grade: cinematic]',
        );
        assert.equal(result.scenes.length, 1, 'em-dash multi-clause line must not explode into scenes');
        const s = result.scenes[0];
        // avs_s1_github.png exists in input/visuals, so the parser binds localAsset to it
        assert.equal(s.localAsset, 'avs_s1_github.png', 'localAsset binding must be preserved on the single scene');
        assert.ok(s.voiceoverText.includes('Meet AVS'), 'full narration retained, not truncated');
    } finally {
        for (const f of fixtures) fs.rmSync(path.join(visDir, f), { force: true });
    }
});

test('B1: several [Visual:] lines each become exactly one scene in author order', async () => {
    const visDir = path.join(process.cwd(), 'input', 'visuals');
    fs.mkdirSync(visDir, { recursive: true });
    const fixtures = ['avs_s1_github.png', 'avs_showcase_s0.mp4', 'avs_showcase_s7.mp4'];
    for (const f of fixtures) fs.writeFileSync(path.join(visDir, f), 'x');
    try {
        const result = await parseScript(
            'Hook question here. [Visual: avs_showcase_s0.mp4] [Transition: slide]\n' +
            'Middle scene with detail. [Visual: avs_s1_github.png] [Grade: cinematic]\n' +
            'Closing CTA. [Visual: avs_showcase_s7.mp4] [Transition: fade]',
        );
        assert.equal(result.scenes.length, 3, '3 tagged lines -> exactly 3 scenes');
        assert.equal(result.scenes[0].localAsset, 'avs_showcase_s0.mp4');
        assert.equal(result.scenes[1].localAsset, 'avs_s1_github.png');
        assert.equal(result.scenes[2].localAsset, 'avs_showcase_s7.mp4');
    } finally {
        for (const f of fixtures) fs.rmSync(path.join(visDir, f), { force: true });
    }
});

