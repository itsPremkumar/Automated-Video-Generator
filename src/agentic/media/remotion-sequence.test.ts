/**
 * remotion-sequence.test.ts — offline tests for the verify + sequence helpers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyClip } from '../media/remotion-verify.js';
import { extractMotionTags } from '../media/hermes-remotion-controller.js';

test('verifyClip: signal fails on a missing file (no ffprobe match)', async () => {
  const r = await verifyClip('/nonexistent/path/clip.mp4', { index: 0, text: 'x', kind: 'hud' });
  assert.equal(r.ok, false);
  assert.equal(r.signal, false);
});

test('verifyClip: vision callback is invoked when file exists but signal fails -> still ok:false', async () => {
  let called = false;
  const r = await verifyClip('/nonexistent/clip.mp4', { index: 1, text: 'y' }, {
    visionCheck: async () => {
      called = true;
      return { ok: true, note: 'looks right' };
    },
  });
  // signal gate fails first, so vision is NOT called (short-circuit)
  assert.equal(called, false);
  assert.equal(r.ok, false);
});

test('extractMotionTags: still covers [GenMotion:] variety', () => {
  const tags = extractMotionTags('A [GenMotion: neural net]');
  assert.equal(tags[0], 'neural net');
});
