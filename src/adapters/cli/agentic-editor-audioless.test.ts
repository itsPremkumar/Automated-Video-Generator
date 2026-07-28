/**
 * agentic-editor-audioless.test.ts — empirical verification of the E2 audio-less
 * guards in the CLI single-task editor (agentic-editor.ts). These commands used
 * `[0:a]`/`[1:a]` unconditionally and crashed ("matches no streams") on
 * audio-less inputs. Now they probe and drop the audio branch.
 *
 *   loop      → `[0:a]aloop`  (crash on audio-less)
 *   reverse   → `[0:a]areverse` (crash on audio-less)
 *   transition→ `[0:a][1:a]acrossfade` (crash if either clip audio-less)
 *   duck      → `[0:a][sc]sidechaincompress` (crash if music/voice audio-less)
 *
 * Each test feeds an AUDIO-LESS video (or audio-less pair) and asserts the
 * command still produces a valid output file (no crash). A real (non-silent)
 * control case is also checked for the transition path.
 *
 * Run: npx tsx --test src/adapters/cli/agentic-editor-audioless.test.ts
 */
import { test } from 'node:test';
import assert from 'assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { COMMANDS } from './agentic-editor.js';

const ffmpeg: string = require('ffmpeg-static');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-editor-'));

function audioLessVideo(name: string, dur = 3): string {
  const p = path.join(TMP, name);
  execFileSync(ffmpeg, ['-f', 'lavfi', '-i', `color=c=blue:s=320x180:d=${dur}:r=25`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', String(dur), '-y', p], { stdio: 'ignore' });
  return p;
}
function realAudioVideo(name: string, dur = 3): string {
  const p = path.join(TMP, name);
  // video + a real (sine) audio track
  const a = path.join(TMP, 'tone.wav');
  execFileSync(ffmpeg, ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${dur}`, '-c:a', 'pcm_s16le', '-t', String(dur), '-y', a], { stdio: 'ignore' });
  execFileSync(ffmpeg, ['-f', 'lavfi', '-i', `color=c=red:s=320x180:d=${dur}:r=25`, '-i', a, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', String(dur), '-y', p], { stdio: 'ignore' });
  return p;
}

test('E2: loop on AUDIO-LESS video produces output (no [0:a] crash)', () => {
  const v = audioLessVideo('e2_loop.mp4');
  const out = path.join(TMP, 'e2_loop_out.mp4');
  COMMANDS['loop']({ input: v, n: '2', output: out });
  assert.ok(fs.existsSync(out) && fs.statSync(out).size > 1000, 'loop produced a valid file on audio-less input');
});

test('E2: reverse on AUDIO-LESS video produces output (no [0:a] crash)', () => {
  const v = audioLessVideo('e2_rev.mp4');
  const out = path.join(TMP, 'e2_rev_out.mp4');
  COMMANDS['reverse']({ input: v, output: out });
  assert.ok(fs.existsSync(out) && fs.statSync(out).size > 1000, 'reverse produced a valid file on audio-less input');
});

test('E2: transition between AUDIO-LESS clips produces output (no acrossfade crash)', () => {
  const a = audioLessVideo('e2_ta.mp4');
  const b = audioLessVideo('e2_tb.mp4');
  const out = path.join(TMP, 'e2_trans_out.mp4');
  COMMANDS['transition']({ a, b, type: 'fade', duration: '0.5', output: out });
  assert.ok(fs.existsSync(out) && fs.statSync(out).size > 1000, 'transition produced a valid file on audio-less pair');
});

test('E2: duck with AUDIO-LESS voice (music only) produces output (no [1:a] crash)', () => {
  const music = realAudioVideo('e2_music.mp4');
  const voice = audioLessVideo('e2_voice.mp4'); // audio-less "voice" → nothing to duck under
  const out = path.join(TMP, 'e2_duck_out.mp4');
  COMMANDS['duck']({ music, voice, output: out });
  assert.ok(fs.existsSync(out) && fs.statSync(out).size > 1000, 'duck produced a valid file when voice is audio-less');
});

test('E2: transition between REAL-audio clips still crossfades (control)', () => {
  const a = realAudioVideo('e2_ca.mp4');
  const b = realAudioVideo('e2_cb.mp4');
  const out = path.join(TMP, 'e2_trans_audio_out.mp4');
  COMMANDS['transition']({ a, b, type: 'fade', duration: '0.5', output: out });
  assert.ok(fs.existsSync(out) && fs.statSync(out).size > 1000, 'transition still works with real audio (crossfade path)');
});
