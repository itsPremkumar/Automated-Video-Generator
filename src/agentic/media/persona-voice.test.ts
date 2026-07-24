/**
 * persona-voice.test.ts — Wave N/O regression guards.
 *
 * Proves the multi-persona + in-scene dialogue CONTROL SURFACE works
 * deterministically (no VoiceBox model needed):
 *   1. buildPlan assigns each scene a persona (scenePersonas > dialogueVoices
 *      alternation > defaultPersona) and attaches in-scene dialogue turns.
 *   2. resolvePersonas maps persona specs -> {id,engine}, using an explicit
 *      profileId when given and falling back otherwise.
 *   3. concatDialogueTurns really concatenates per-turn audio (real ffmpeg)
 *      into one scene track with a silence gap between speakers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { buildPlan } from '../pipeline/plan.js';
import { resolvePersonas, concatDialogueTurns } from '../media/voice-controller.js';
import { parseScript } from '../../lib/script-parser.js';

const fakeWs: any = { root: '/tmp/noop', audioDir: '/tmp/noop' };

test('buildPlan assigns per-scene persona from scenePersonas', async () => {
  const plan = await buildPlan(
    'A. host line one.\nB. host line two.\nC. host line three.',
    {
      jobId: 'j', title: 't',
      scenePersonas: { 0: 'host', 1: 'guest', 2: 'host' },
      personas: [{ id: 'host' }, { id: 'guest' }] as any,
    },
    parseScript,
  );
  assert.equal(plan.scenes[0].voicePersona, 'host');
  assert.equal(plan.scenes[1].voicePersona, 'guest');
  assert.equal(plan.scenes[2].voicePersona, 'host');
  assert.ok(plan.personas?.some((p) => p.id === 'host'));
});

test('buildPlan alternates dialogueVoices across scenes when no scenePersonas', async () => {
  const plan = await buildPlan(
    'A. one.\nB. two.\nC. three.\nD. four.',
    {
      jobId: 'j', title: 't',
      dialogueVoices: ['alice', 'bob'] as any,
      personas: [{ id: 'alice' }, { id: 'bob' }] as any,
    },
    parseScript,
  );
  assert.equal(plan.scenes[0].voicePersona, 'alice');
  assert.equal(plan.scenes[1].voicePersona, 'bob');
  assert.equal(plan.scenes[2].voicePersona, 'alice');
  assert.equal(plan.scenes[3].voicePersona, 'bob');
});

test('buildPlan defaultPersona applies to every scene', async () => {
  const plan = await buildPlan(
    'A. one.\nB. two.',
    { jobId: 'j', title: 't', defaultPersona: 'narrator', personas: [{ id: 'narrator' }] as any },
    parseScript,
  );
  assert.equal(plan.scenes[0].voicePersona, 'narrator');
  assert.equal(plan.scenes[1].voicePersona, 'narrator');
});

test('buildPlan attaches in-scene dialogue turns', async () => {
  const plan = await buildPlan(
    'A. scene text.',
    {
      jobId: 'j', title: 't',
      sceneDialogue: { 0: [
        { speaker: 'host', text: 'Welcome to the show.' },
        { speaker: 'guest', text: 'Thanks for having me.' },
      ] },
      personas: [{ id: 'host' }, { id: 'guest' }] as any,
    },
    parseScript,
  );
  assert.ok(plan.scenes[0].dialogue);
  assert.equal(plan.scenes[0].dialogue!.length, 2);
  assert.equal(plan.scenes[0].dialogue![0].speaker, 'host');
  assert.equal(plan.scenes[0].dialogue![1].speaker, 'guest');
});

test('resolvePersonas uses explicit profileId without network', async () => {
  const map = await resolvePersonas(
    [
      { id: 'p1', profileId: 'prof-abc' },
      { id: 'p2', profileId: 'prof-def' },
    ] as any,
    fakeWs,
    { id: 'fallback-id', engine: 'kokoro' },
  );
  assert.equal(map.get('p1')!.id, 'prof-abc');
  assert.equal(map.get('p2')!.id, 'prof-def');
});

test('resolvePersonas returns empty map for no personas', async () => {
  const map = await resolvePersonas(undefined, fakeWs, { id: 'x', engine: 'kokoro' });
  assert.equal(map.size, 0);
});

test('concatDialogueTurns really concatenates per-turn audio (real ffmpeg)', async () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMP || '/tmp', 'dlg-'));
  const ffmpeg: any = require('ffmpeg-static');
  const make = (p: string, dur: number) =>
    require('child_process').execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', `sine=frequency=220:duration=${dur}`, '-c:a', 'pcm_s16le', p], { stdio: 'ignore' });
  const t1 = path.join(dir, 't1.wav');
  const t2 = path.join(dir, 't2.wav');
  make(t1, 1.0);
  make(t2, 1.0);
  const out = path.join(dir, 'out.wav');
  const dur = await concatDialogueTurns([t1, t2], out, 0.3);
  assert.ok(fs.existsSync(out) && fs.statSync(out).size > 1000, 'concatenated file exists');
  // two 1.0s clips + one 0.3s gap ≈ 2.3s
  assert.ok(dur > 2.0 && dur < 2.8, `concat duration in expected range, got ${dur}`);
});

test('concatDialogueTurns single turn copies through', async () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMP || '/tmp', 'dlg2-'));
  const ffmpeg: any = require('ffmpeg-static');
  const t1 = path.join(dir, 't1.wav');
  require('child_process').execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=0.5', '-c:a', 'pcm_s16le', t1], { stdio: 'ignore' });
  const out = path.join(dir, 'out.wav');
  const dur = await concatDialogueTurns([t1], out);
  assert.ok(fs.existsSync(out) && fs.statSync(out).size > 1000);
  assert.ok(dur > 0.3 && dur < 0.8, `single-turn duration, got ${dur}`);
});
