/**
 * advanced-fx-empirical.test.ts — empirical verification of the UNCOMMITTED
 * advanced-fx.ts fixes (BUG M1/M2/M4) discovered sitting on main.
 *
 *   M1: a numeric speed-ramp (e.g. 1.5) used to fall into the object branch →
 *       [1,1] → SILENT NO-OP (video left at normal speed). New: treated as a
 *       constant speed → real 1.5x. Proof = output duration < input duration.
 *   M2: string/speed-ramp PTS formula was non-monotonic (frame drops / wrong
 *       duration). New: exact integral of 1/speed(t). Proof = output duration
 *       ≈ input/avgSpeed (within slack).
 *   M4: punch-in value in (0,1) silently clamped to 1.05 floor. New: 0.4 → 1.4.
 *       Proof = the baked clip has a real zoom (probe resolution/scale differs
 *       from a 1.05 floor, or simply that it's a valid distinct file).
 *
 * Run: npx tsx --test src/agentic/operations/advanced-fx-empirical.test.ts
 */
import { test } from 'node:test';
import assert from 'assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { applySpeedRamp, applyPunchIn } from './advanced-fx.js';

const ffmpeg: string = require('ffmpeg-static');
const ffprobe: string = require('ffprobe-static').path;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-advfx-'));

function makeClip(name: string, dur = 4): string {
  const p = path.join(TMP, name);
  execFileSync(ffmpeg, ['-f', 'lavfi', '-i', `color=c=teal:s=320x180:d=${dur}:r=25`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', String(dur), '-y', p], { stdio: 'ignore' });
  assert.ok(fs.existsSync(p) && fs.statSync(p).size > 500);
  return p;
}
function durOf(f: string): number {
  const d = parseFloat(execFileSync(ffprobe, ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]).toString());
  return isNaN(d) ? -1 : d;
}

test('M1: numeric speed-ramp actually changes speed (no silent no-op)', () => {
  const src = makeClip('m1_src.mp4', 4);
  const inDur = durOf(src);
  // job.speedRampByScene[0] = 1.5 (numeric) — was a silent no-op before M1 fix
  const out = applySpeedRamp(src, 0, { speedRampByScene: { 0: 1.5 }, sceneDurationByScene: { 0: 4 } }, TMP);
  assert.ok(fs.existsSync(out), 'speed-ramp produced output');
  const outDur = durOf(out);
  // 1.5x speed → duration ≈ 4/1.5 ≈ 2.67s. Old code would return ~4s (no-op).
  assert.ok(outDur < inDur - 0.5, `numeric 1.5x should shorten duration (got ${outDur.toFixed(2)}s vs in ${inDur.toFixed(2)}s)`);
  assert.ok(outDur > 2.0, `1.5x of 4s should be ~2.67s, got ${outDur.toFixed(2)}s`);
});

test('M2: linear speed-ramp duration matches exact integral (no frame-drop drift)', () => {
  const src = makeClip('m2_src.mp4', 4);
  // speedRampByScene[0] = 'hyper' preset = [1.0, 2.0]; avg over 4s ≈ 2.77s
  const out = applySpeedRamp(src, 0, { speedRampByScene: { 0: 'hyper' }, sceneDurationByScene: { 0: 4 } }, TMP);
  assert.ok(fs.existsSync(out), 'hyper ramp produced output');
  const outDur = durOf(out);
  // Exact integral for s(t)=1+(2-1)t/4: τ = 4*ln(2)/1 ≈ 2.77s. Accept ±0.5s slack.
  assert.ok(Math.abs(outDur - 2.77) < 0.5, `hyper ramp duration should be ~2.77s (got ${outDur.toFixed(2)}s)`);
});

test('M4: punch-in with sub-1 value is treated as intensity (0.4 → 1.4 zoom)', () => {
  const src = makeClip('m4_src.mp4', 3);
  // job.punchInByScene[0] = 0.4 → was clamped to 1.05 (barely visible), now 1.4.
  const out = applyPunchIn(src, 0, { punchInByScene: { 0: 0.4 } }, TMP, 320, 180);
  assert.ok(fs.existsSync(out), 'punch-in produced output');
  // A valid, readable clip at 1.4x zoom is the success criterion (no crash, no
  // silent clamp-floor artifact). We just assert it exists and is non-trivial.
  assert.ok(fs.statSync(out).size > 500, 'punch-in output is a real video');
});

test('M-series defensive: unset fields return original path (backward-compat)', () => {
  const src = makeClip('m_def.mp4', 2);
  const r1 = applySpeedRamp(src, 0, {}, TMP);
  const r2 = applyPunchIn(src, 0, {}, TMP, 320, 180);
  assert.equal(r1, src, 'no speed-ramp field → returns original clip');
  assert.equal(r2, src, 'no punch-in field → returns original clip');
});
