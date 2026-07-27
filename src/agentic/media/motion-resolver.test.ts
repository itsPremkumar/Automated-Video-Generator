/**
 * motion-resolver.test.ts — pure, offline tests for the [Motion:] tag parser
 * and multi-location library resolution. No browser/ffmpeg needed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMotionTag,
  resolveMotion,
  libraryExists,
} from '../media/motion-resolver.js';

test('parseMotionTag: bare composition -> default library', () => {
  const r = parseMotionTag('NeuralNetwork');
  assert.equal(r.composition, 'NeuralNetwork');
  assert.equal(r.library, 'creation');
});

test('parseMotionTag: composition@library split', () => {
  const r = parseMotionTag('BarChartInfographic@create');
  assert.equal(r.composition, 'BarChartInfographic');
  assert.equal(r.library, 'create');
});

test('parseMotionTag: strips brackets + whitespace', () => {
  const r = parseMotionTag('  [Motion: HudRadar@brand2026]  ');
  assert.equal(r.composition, 'HudRadar');
  assert.equal(r.library, 'brand2026');
});

test('resolveMotion: known default library resolves a real entry', () => {
  const r = resolveMotion('NeuralNetwork', undefined);
  assert.equal(r.composition, 'NeuralNetwork');
  assert.equal(r.library, 'creation');
  assert.ok(r.entryPoint.includes('remotion-creation'));
  assert.ok(r.entryPoint.endsWith('index.ts'));
  assert.ok(libraryExists('creation'));
});

test('resolveMotion: custom library map resolves a folder', () => {
  const r = resolveMotion('NeuralNetwork@create', { create: 'remotion-creation' });
  assert.equal(r.library, 'create');
  assert.ok(r.entryPoint.includes('remotion-creation'));
});

test('resolveMotion: unknown library throws a clear error', () => {
  assert.throws(
    () => resolveMotion('X@ghost', { creation: 'remotion-creation' }),
    /unknown library "ghost"/,
  );
});

test('resolveMotion: missing entry folder throws', () => {
  assert.throws(
    () => resolveMotion('X@create', { create: 'does-not-exist-folder' }),
    /entry not found/,
  );
});
