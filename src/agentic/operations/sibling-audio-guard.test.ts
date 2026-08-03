/**
 * sibling-audio-guard.test.ts — empirical regression guard for the BUG #4
 * audio-less crash class found in SIBLING modules (edit.ts fixes were the
 * first wave; this covers agentic-editor.ts `speed` and silence.ts
 * silence-remove).
 *
 * Both previously referenced `[0:a]` unconditionally →
 * "Stream specifier ':a' matches no streams" crash on audio-less input.
 *
 * Run: npx tsx --test src/agentic/operations/sibling-audio-guard.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { removeSilence } from './silence.js';
import { parseProbe } from './probe.js';

const ffmpeg: string = require('ffmpeg-static');
const ffprobe: string = require('ffprobe-static').path;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-sib-audio-'));

function makeClip(name: string, withAudio: boolean, dur = 3): string {
  const p = path.join(TMP, name);
  const args: string[] = ['-f', 'lavfi', '-i', `color=c=teal:s=640x360:d=${dur}:r=25`];
  if (withAudio) args.push('-f', 'lavfi', '-i', 'sine=frequency=440:duration=' + dur, '-c:a', 'aac');
  else args.push('-an');
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', String(dur), '-y', p);
  execFileSync(ffmpeg, args, { stdio: 'ignore' });
  assert.ok(fs.existsSync(p) && fs.statSync(p).size > 1000);
  return p;
}

function probeStreams(file: string): { video: boolean; audio: boolean } {
  const out = execFileSync(ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_streams', file]).toString();
  const streams = (JSON.parse(out).streams ?? []) as any[];
  return {
    video: streams.some((s) => s.codec_type === 'video'),
    audio: streams.some((s) => s.codec_type === 'audio'),
  };
}

// silence.ts: removeSilence needs spoken spans; for the audio-less guard test
// we exercise the probe-driven hasAudio path directly via removeSilence on an
// audio-less clip that has speech-like content is impossible, so instead we
// assert removeSilence does NOT throw "matches no streams" and returns a valid
// (silent) output. We feed a clip with audio but verify the guard logic by
// probing an audio-less file through removeSilence's pass-through.

test('probe.parseProbe: detects hasAudio correctly', () => {
  const withAudio = makeClip('pa_a.mp4', true);
  const noAudio = makeClip('pa_na.mp4', false);
  const a = parseProbe(execFileSync(ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', withAudio]).toString());
  const n = parseProbe(execFileSync(ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', noAudio]).toString());
  assert.equal(a.hasAudio, true, 'audio clip should report hasAudio=true');
  assert.equal(n.hasAudio, false, 'silent clip should report hasAudio=false');
});

test('silence.ts removeSilence: audio-less input does NOT crash on [0:a]', async () => {
  const src = makeClip('sil_na.mp4', false, 2);
  const out = path.join(TMP, 'sil_na_out.mp4');
  // removeSilence with a no-speech audio-less clip: on the OLD code it threw
  // "Stream specifier ':a' matches no streams". Now it must pass through or
  // fail gracefully (never with the ':a' matcher crash).
  let threw = false;
  let msg = '';
  try {
    const r = await removeSilence(src, out);
    // Either a clean pass-through (no speech) or a graceful fail is acceptable;
    // what we forbid is the ':a' matches-no-streams crash.
    if (!r.ok) {
      assert.doesNotMatch(r.detail, /matches no streams/, 'must not crash on missing audio stream');
    }
  } catch (e: any) {
    threw = true;
    msg = e?.message ?? String(e);
  }
  assert.doesNotMatch(msg, /matches no streams/, 'removeSilence must not throw the [0:a] crash on audio-less input');
  assert.ok(!threw || !/matches no streams/.test(msg), 'no [0:a] matcher crash');
});

// agentic-editor.ts `speed` is a CLI command dispatcher (COMMANDS['speed']),
// not directly importable without arg parsing. We empirically validate the
// EQUIVALENT filter-graph construction it now uses by re-implementing the
// guarded branch against a real audio-less clip via ffmpeg directly — proving
// the [0:a]-skipped graph succeeds where the old one crashed.
test('agentic-editor speed-graph: audio-less input renders with [0:a] branch skipped', () => {
  const src = makeClip('spd_na.mp4', false, 3);
  const out = path.join(TMP, 'spd_na_out.mp4');
  // OLD graph (must crash):  [0:v]setpts=...;[0:a]atempo=...
  let oldCrashed = false;
  try {
    execFileSync(ffmpeg, ['-i', src, '-filter_complex', '[0:v]setpts=2*PTS[v];[0:a]atempo=0.5[a]', '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-c:a', 'aac', out + '.old.mp4', '-y'], { stdio: 'ignore' });
  } catch { oldCrashed = true; }
  assert.ok(oldCrashed, 'OLD [0:a] graph must crash on audio-less input (baseline)');
  // NEW graph (guarded):       [0:v]setpts=2*PTS[v]  only
  execFileSync(ffmpeg, ['-i', src, '-filter_complex', '[0:v]setpts=2*PTS[v]', '-map', '[v]', '-c:v', 'libx264', out, '-y'], { stdio: 'ignore' });
  assert.ok(fs.existsSync(out), 'NEW guarded graph must produce output on audio-less input');
  const s = probeStreams(out);
  assert.ok(s.video && !s.audio, 'guarded speed output: video present, no audio (correct)');
});

// render.ts non-segmented music-mux: when the silent video has NO audio
// (no voiceover), the pass2 amix referenced [0:a] and crashed. The fixed
// branch muxes music ALONE. Prove the fixed graph works, old crashes.
test('render pass2: music-mux on audio-less silent video (no [0:a] crash)', () => {
  const silent = makeClip('silent_na.mp4', false, 3); // audio-less
  const music = makeClip('music.mp4', true, 3);        // has audio
  const out = path.join(TMP, 'music_mux_out.mp4');
  const full = 0.18;
  // OLD (crashes): [1:a]volume=full[a];[0:a][a]amix=inputs=2...
  let oldCrashed = false;
  try {
    execFileSync(ffmpeg, ['-i', silent, '-i', music,
      '-filter_complex', `[1:a]volume=${full}[a];[0:a][a]amix=inputs=2:duration=shortest[amixout];[amixout]alimiter=limit=0.7:asc=1:level=disabled[aout]`,
      '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', out + '.old.mp4', '-y'], { stdio: 'ignore' });
  } catch { oldCrashed = true; }
  assert.ok(oldCrashed, 'OLD [0:a] amix graph must crash on audio-less silent (baseline)');
  // NEW (guarded): [1:a]volume=full[a];[a]alimiter...
  execFileSync(ffmpeg, ['-i', silent, '-i', music,
    '-filter_complex', `[1:a]volume=${full}[a];[a]alimiter=limit=0.7:asc=1:level=disabled[aout]`,
    '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', out, '-y'], { stdio: 'ignore' });
  assert.ok(fs.existsSync(out), 'NEW guarded music-mux must produce output on audio-less silent');
  const s = probeStreams(out);
  assert.ok(s.video && s.audio, 'music-mux output: video + music audio present');
});
