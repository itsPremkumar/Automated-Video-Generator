/**
 * hermes-remotion-controller.test.ts — offline tests for the autonomous
 * codegen controller's pure logic (no Chrome/ffmpeg needed).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authorRemotionComponent,
  assertSafeImports,
} from '../media/remotion-codegen.js';
import { extractMotionTags } from '../media/hermes-remotion-controller.js';

test('authorRemotionComponent: synthesizes a valid infographic .tsx', () => {
  const src = authorRemotionComponent({
    index: 2,
    kind: 'infographic',
    title: 'Sales',
    data: [10, 20, 30],
    labels: ['Q1', 'Q2', 'Q3'],
  });
  assert.ok(src.includes('export const Scene2'));
  assert.ok(src.includes("import { AbsoluteFill"));
  // safety: only allowlisted imports
  assert.doesNotThrow(() => assertSafeImports(src));
});

test('authorRemotionComponent: uses provided raw code verbatim', () => {
  const raw = `import React from 'react';\nimport { AbsoluteFill } from 'remotion';\nexport const Scene0: React.FC = () => <AbsoluteFill>hi</AbsoluteFill>;`;
  const src = authorRemotionComponent({ index: 0, code: raw });
  assert.equal(src, raw);
});

test('assertSafeImports: blocks fs / child_process / network', () => {
  assert.throws(
    () => assertSafeImports(`import fs from 'fs';`),
    /unsafe import blocked/,
  );
  assert.throws(
    () => assertSafeImports(`import { exec } from 'child_process';`),
    /unsafe import blocked/,
  );
  assert.throws(
    () => assertSafeImports(`import net from 'net';`),
    /unsafe import blocked/,
  );
});

test('assertSafeImports: allows remotion / react / @remotion/* / local', () => {
  const ok = `import { AbsoluteFill } from 'remotion';
import React from 'react';
import { getAudioData } from '@remotion/media-utils';
import { Helper } from './_lib/Helper';`;
  assert.doesNotThrow(() => assertSafeImports(ok));
});

test('extractMotionTags: parses [GenMotion:] and [Motion:] per scene line', () => {
  const script = [
    'Intro scene. [Visual: studio]',
    'Explain AI. [GenMotion: neural network diagram]',
    'Growth chart. [Motion: BarChart]',
    'Outro. [Visual: city]',
  ].join('\n');
  const tags = extractMotionTags(script);
  assert.equal(tags[1], 'neural network diagram');
  assert.equal(tags[2], 'BarChart');
  assert.equal(tags[0], undefined);
  assert.equal(tags[3], undefined);
});

test('extractMotionTags: case-insensitive + trims', () => {
  const tags = extractMotionTags('Hi. [genmotion:  HUD radar ]');
  assert.equal(tags[0].trim(), 'HUD radar');
});
