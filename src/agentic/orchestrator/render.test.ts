/**
 * render.test.ts — regression guard for BUG A3 (voiceover render crash).
 *
 * Root cause: `renderAgenticSlideshow` indexed
 * `res.voiceovers?.scenes[clip.idx]`, which throws
 * `TypeError: Cannot read properties of undefined (reading '0')` when
 * `voiceovers` is the SLIM fallback shape emitted by the modular CLI
 * ({voiceoverDriven, sceneCount, fallbackUsed} — NO `scenes` array, written
 * when the voice stage produced no per-scene WAVs).
 *
 * This test pins `sceneVoicePath` (the defensive accessor) so the slim shape
 * returns undefined (→ silent anullsrc track) instead of crashing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneVoicePath } from './render.js';

test('sceneVoicePath: full voiceovers shape returns the indexed audio path', () => {
  const vo = {
    scenes: [{ audioPath: 'a0.wav' }, { audioPath: 'a1.wav' }],
    voiceoverDriven: true,
    sidecars: [],
    fallbackUsed: false,
  } as any;
  assert.equal(sceneVoicePath(vo, 0), 'a0.wav');
  assert.equal(sceneVoicePath(vo, 1), 'a1.wav');
  assert.equal(sceneVoicePath(vo, 5), undefined); // out of range → undefined
});

test('sceneVoicePath: SLIM fallback shape (no scenes array) must NOT throw', () => {
  // This is exactly the shape that previously threw TypeError at render.ts:736.
  const slim = { voiceoverDriven: false, sceneCount: 0, fallbackUsed: true } as any;
  assert.doesNotThrow(() => {
    for (let i = 0; i < 4; i++) {
      const p = sceneVoicePath(slim, i);
      assert.equal(p, undefined); // no audio → renderer uses silent anullsrc
    }
  });
});

test('sceneVoicePath: null/undefined voiceovers must NOT throw', () => {
  assert.doesNotThrow(() => {
    assert.equal(sceneVoicePath(null, 0), undefined);
    assert.equal(sceneVoicePath(undefined, 0), undefined);
  });
});

test('sceneVoicePath: scenes present but entry missing audioPath → undefined', () => {
  const vo = { scenes: [{}, { audioPath: 'x.wav' }] } as any;
  assert.equal(sceneVoicePath(vo, 0), undefined);
});
