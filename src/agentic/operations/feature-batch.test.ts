import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveXfadeKind } from './compose.js';
import { AVAILABLE_VOICES, LANGUAGE_DEFAULTS } from '../../lib/voice-data.js';

// ─────────────────────────────────────────────────────────────────────────────
// Feature batch 2026-08-11: extended transition presets + expanded voice data.
// Pure mappings — deterministic, no network, no ffmpeg needed.
// ─────────────────────────────────────────────────────────────────────────────

test('resolveXfadeKind: classic presets keep prior behavior', () => {
    assert.equal(resolveXfadeKind('fade'), 'fade');
    assert.equal(resolveXfadeKind('slide'), 'slideleft');
    assert.equal(resolveXfadeKind('zoomblur'), 'zoomin');
    assert.equal(resolveXfadeKind('cut'), 'fade'); // cut is handled by the caller (hard-cut branch), not the mapping
});

test('resolveXfadeKind: extended presets map to native xfade kinds', () => {
    assert.equal(resolveXfadeKind('dissolve'), 'dissolve');
    assert.equal(resolveXfadeKind('wipeleft'), 'wipeleft');
    assert.equal(resolveXfadeKind('wiperight'), 'wiperight');
    assert.equal(resolveXfadeKind('wipeup'), 'wipeup');
    assert.equal(resolveXfadeKind('wipedown'), 'wipedown');
    assert.equal(resolveXfadeKind('circlecrop'), 'circlecrop');
    assert.equal(resolveXfadeKind('smoothleft'), 'smoothleft');
    assert.equal(resolveXfadeKind('smoothup'), 'smoothup');
    assert.equal(resolveXfadeKind('smoothdown'), 'smoothdown');
    assert.equal(resolveXfadeKind('radial'), 'radial');
    assert.equal(resolveXfadeKind('zoomin'), 'zoomin');
    assert.equal(resolveXfadeKind('zoomout'), 'zoomout');
    assert.equal(resolveXfadeKind('slideup'), 'slideup');
    assert.equal(resolveXfadeKind('slidedown'), 'slidedown');
    assert.equal(resolveXfadeKind('flash'), 'fadewhite');
});

test('resolveXfadeKind: plugin aliases keep their mapped kinds', () => {
    assert.equal(resolveXfadeKind('glitch'), 'pixelize');
    assert.equal(resolveXfadeKind('whippan'), 'hblur');
    assert.equal(resolveXfadeKind('whip-pan'), 'hblur');
    assert.equal(resolveXfadeKind('morphcut'), 'smoothleft');
    assert.equal(resolveXfadeKind('morph-cut'), 'smoothleft');
    assert.equal(resolveXfadeKind('lightleak'), 'fadewhite');
    assert.equal(resolveXfadeKind('light-leak'), 'fadewhite');
});

test('resolveXfadeKind: unknown/undefined falls back to fade (never breaks graph)', () => {
    assert.equal(resolveXfadeKind(undefined), 'fade');
    assert.equal(resolveXfadeKind(''), 'fade');
    assert.equal(resolveXfadeKind('typo-transition'), 'fade');
    assert.equal(resolveXfadeKind('mixed'), 'fade'); // 'mixed' resolved elsewhere; safe default
});

test('voice data: every LANGUAGE_DEFAULTS key exists in AVAILABLE_VOICES with male+female', () => {
    for (const lang of Object.keys(LANGUAGE_DEFAULTS)) {
        const entry = AVAILABLE_VOICES[lang];
        assert.ok(entry, `AVAILABLE_VOICES missing language key: ${lang}`);
        assert.ok(entry.male.length > 0, `${lang} has no male voices`);
        assert.ok(entry.female.length > 0, `${lang} has no female voices`);
        // The default voice must be listed in that language's voices.
        const all = [...entry.male, ...entry.female];
        assert.ok(all.includes(LANGUAGE_DEFAULTS[lang]), `${lang} default ${LANGUAGE_DEFAULTS[lang]} not in its voice list`);
    }
});

test('voice data: new languages present (italian, japanese, korean, chinese, arabic, russian, bengali, urdu...)', () => {
    for (const lang of ['italian', 'japanese', 'korean', 'portuguese', 'russian', 'arabic', 'chinese', 'bengali', 'gujarati', 'marathi', 'punjabi', 'urdu']) {
        assert.ok(AVAILABLE_VOICES[lang], `missing new language: ${lang}`);
        assert.ok(AVAILABLE_VOICES[lang].male.length >= 1 && AVAILABLE_VOICES[lang].female.length >= 1, `${lang} needs both genders`);
    }
});

test('voice data: english gained extra voices', () => {
    assert.ok(AVAILABLE_VOICES.english.male.includes('en-US-BrianNeural'));
    assert.ok(AVAILABLE_VOICES.english.female.includes('en-US-MichelleNeural'));
});
