/**
 * compose-music-lufs.test.ts — Wave L regression guard.
 *
 * `musicIntensity` ('calm'|'mid'|'energetic') was an AI-style hint that the
 * deterministic render ignored; music was always normalized to -14 LUFS.
 * `resolveMusicLufs` makes it real:
 *   calm -> -18, mid -> -14, energetic -> -10.
 * Precedence: explicit normalizeLufs > musicIntensity > default -14.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMusicLufs } from './compose.js';

test('default (no intensity/lufs) is -14 LUFS', () => {
  assert.equal(resolveMusicLufs({}), -14);
});

test('musicIntensity calm -> -18', () => {
  assert.equal(resolveMusicLufs({ musicIntensity: 'calm' }), -18);
});

test('musicIntensity mid -> -14', () => {
  assert.equal(resolveMusicLufs({ musicIntensity: 'mid' }), -14);
});

test('musicIntensity energetic -> -10', () => {
  assert.equal(resolveMusicLufs({ musicIntensity: 'energetic' }), -10);
});

test('explicit normalizeLufs wins over musicIntensity', () => {
  assert.equal(resolveMusicLufs({ musicIntensity: 'energetic', normalizeLufs: -20 }), -20);
  assert.equal(resolveMusicLufs({ musicIntensity: 'calm', normalizeLufs: -8 }), -8);
});

test('unknown musicIntensity falls back to -14', () => {
  // @ts-expect-error intentionally wrong value to test the fallback
  assert.equal(resolveMusicLufs({ musicIntensity: 'unknown' }), -14);
});
