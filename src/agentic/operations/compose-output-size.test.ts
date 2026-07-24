/**
 * compose-output-size.test.ts — the `platform` / `aspect` / `orientation`
 * → output frame size resolver.
 *
 * Regression guard for Wave I: `platform` used to be an AI-only hint that
 * never touched the deterministic render (a `platform:'youtube'` job still
 * came out 9:16 portrait). `resolveOutputSize` makes it real, so we lock the
 * mapping down with assertions.
 *
 * Precedence tested: explicit aspect > orientation > platform default > portrait.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOutputSize } from './compose.js';

test('default (no aspect/orientation/platform) is 720x1280 portrait', () => {
  assert.deepEqual(resolveOutputSize({}), { width: 720, height: 1280 });
});

test('explicit aspect 16:9 → 1280x720 landscape', () => {
  assert.deepEqual(resolveOutputSize({ aspect: '16:9' }), { width: 1280, height: 720 });
});

test('explicit aspect 9:16 → 720x1280 portrait', () => {
  assert.deepEqual(resolveOutputSize({ aspect: '9:16' }), { width: 720, height: 1280 });
});

test('explicit aspect 1:1 / square → 720x720', () => {
  assert.deepEqual(resolveOutputSize({ aspect: '1:1' }), { width: 720, height: 720 });
  assert.deepEqual(resolveOutputSize({ aspect: 'square' }), { width: 720, height: 720 });
});

test('orientation landscape → 1280x720 (backward compat)', () => {
  assert.deepEqual(resolveOutputSize({ orientation: 'landscape' }), { width: 1280, height: 720 });
});

test('orientation square → 720x720', () => {
  assert.deepEqual(resolveOutputSize({ orientation: 'square' }), { width: 720, height: 720 });
});

test('platform youtube → 16:9 landscape (1280x720)', () => {
  assert.deepEqual(resolveOutputSize({ platform: 'youtube' }), { width: 1280, height: 720 });
});

test('platform tiktok → 9:16 portrait (720x1280)', () => {
  assert.deepEqual(resolveOutputSize({ platform: 'tiktok' }), { width: 720, height: 1280 });
});

test('platform reels → 9:16 portrait', () => {
  assert.deepEqual(resolveOutputSize({ platform: 'reels' }), { width: 720, height: 1280 });
});

test('platform instagram → 1:1 square (720x720)', () => {
  assert.deepEqual(resolveOutputSize({ platform: 'instagram' }), { width: 720, height: 720 });
});

test('explicit aspect wins over platform (youtube + 9:16 → portrait)', () => {
  assert.deepEqual(resolveOutputSize({ platform: 'youtube', aspect: '9:16' }), { width: 720, height: 1280 });
});

test('explicit orientation wins over platform (youtube + portrait → 720x1280)', () => {
  assert.deepEqual(resolveOutputSize({ platform: 'youtube', orientation: 'portrait' }), { width: 720, height: 1280 });
});
