/**
 * plan-voice.test.ts — default-voice consistency (Wave J regression guard).
 *
 * Two entry points build a Plan:
 *   - buildPlan() in pipeline/plan.ts → default 'en-US-JennyNeural'
 *   - single-feature.ts buildPipelineRequest path → was hardcoded
 *     'en-US-GuyNeural' (the voice that times out on a flaky Edge-TTS
 *     connection), so an unset job.voice silently resolved differently
 *     per entry point AND failed the voice stage.
 *
 * Lock the contract: an unset voice resolves to 'en-US-JennyNeural'
 * (the working default), and an explicit job.voice is honored.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../pipeline/plan.js';

test('buildPlan defaults voice to en-US-JennyNeural when unset', async () => {
  const plan = await buildPlan('A fact. Another fact.', { jobId: 't1', title: 'T' });
  assert.equal(plan.voice, 'en-US-JennyNeural');
});

test('buildPlan honors an explicit voice override', async () => {
  const plan = await buildPlan('A fact.', { jobId: 't2', title: 'T', voice: 'en-US-AriaNeural' });
  assert.equal(plan.voice, 'en-US-AriaNeural');
});
