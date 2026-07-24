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
import { buildVoiceConfigs } from '../operations/voice-intel.js';

test('buildPlan defaults voice to en-US-JennyNeural when unset', async () => {
  const plan = await buildPlan('A fact. Another fact.', { jobId: 't1', title: 'T' });
  assert.equal(plan.voice, 'en-US-JennyNeural');
});

test('buildPlan honors an explicit voice override', async () => {
  const plan = await buildPlan('A fact.', { jobId: 't2', title: 'T', voice: 'en-US-AriaNeural' });
  assert.equal(plan.voice, 'en-US-AriaNeural');
});

test('buildVoiceConfigs defaults base voice to en-US-JennyNeural (not GuyNeural)', () => {
  // Wave J root cause: voice-intel.ts defaulted base to 'en-US-GuyNeural',
  // which applyVoiceConfigsToPlan() then forced onto the plan — overriding
  // buildPlan()'s Jenny default and timing out on flaky Edge-TTS.
  const cfgs = buildVoiceConfigs(3, {});
  assert.equal(cfgs.length, 3);
  for (const c of cfgs) assert.equal(c.voice, 'en-US-JennyNeural');
});

test('buildVoiceConfigs honors an explicit baseVoice', () => {
  const cfgs = buildVoiceConfigs(2, { baseVoice: 'en-US-AriaNeural' });
  for (const c of cfgs) assert.equal(c.voice, 'en-US-AriaNeural');
});
