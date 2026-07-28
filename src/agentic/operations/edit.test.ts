/**
 * edit.test.ts — empirical regression guard for the re-encode robustness fixes
 * in edit.ts (BUG #1/#2/#4/#6/#7/#9/#11).
 *
 * Each test generates a REAL synthetic clip with the bundled ffmpeg-static and
 * then drives the edit primitive through it, asserting the output is a valid,
 * non-empty, decodeable mp4. This catches the silent "exit 0 but 0-byte /
 * empty-stream" failures the old `-c copy` path produced, and the
 * "Stream specifier ':a' matches no streams" crash for audio-less inputs.
 *
 * Run: npx tsx --test src/agentic/operations/edit.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  mergeVideos,
  trimVideo,
  splitVideo,
  changeSpeed,
  silenceRemove,
  addAudio,
  addProgressBar,
} from './edit.js';

const ffmpeg: string = require('ffmpeg-static');
const ffprobe: string = require('ffprobe-static').path;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-edit-test-'));

/** Make a real synthetic mp4: colored lavfi card + silent/toned audio. */
function makeClip(name: string, opts: { withAudio?: boolean; dur?: number; color?: string } = {}): string {
  const p = path.join(TMP, name);
  const dur = opts.dur ?? 3;
  const color = opts.color ?? 'blue';
  const args = [
    '-f', 'lavfi', '-i', `color=c=${color}:s=640x360:d=${dur}:r=25`,
  ];
  if (opts.withAudio) {
    // audible tone so silenceRemove has something to act on
    args.push('-f', 'lavfi', '-i', `sine=frequency=440:duration=${dur}`);
    args.push('-c:a', 'aac');
  } else {
    args.push('-an');
  }
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', String(dur), '-y', p);
  execFileSync(ffmpeg, args, { stdio: 'ignore' });
  assert.ok(fs.existsSync(p) && fs.statSync(p).size > 1000, `makeClip failed: ${p}`);
  return p;
}

function probeStreams(file: string): { video: boolean; audio: boolean; durSec: number } {
  const out = execFileSync(ffprobe, [
    '-v', 'quiet', '-print_format', 'json',
    '-show_streams', '-show_format', file,
  ]).toString();
  const info = JSON.parse(out);
  const streams = info.streams ?? [];
  const video = streams.some((s: any) => s.codec_type === 'video');
  const audio = streams.some((s: any) => s.codec_type === 'audio');
  const durSec = parseFloat(info.format?.duration ?? '0');
  return { video, audio, durSec };
}

test('trimVideo: re-encodes to a real, non-empty clip (BUG #1)', async () => {
  const src = makeClip('t_src.mp4', { withAudio: true, dur: 3 });
  const out = path.join(TMP, 'trim_out.mp4');
  const r = await trimVideo(src, out, 0.5, 2.0);
  assert.equal(r.ok, true, `trim failed: ${r.detail}`);
  const s = probeStreams(out);
  assert.ok(s.video, 'trim output has no video stream');
  assert.ok(s.durSec > 1.0 && s.durSec < 2.0, `trim duration wrong: ${s.durSec}`);
});

test('splitVideo: both halves re-encode to non-empty clips (BUG #2)', async () => {
  const src = makeClip('s_src.mp4', { withAudio: true, dur: 4 });
  const r = await splitVideo(src, 2);
  assert.equal(r.part1.ok, true, `part1 failed: ${r.part1.detail}`);
  assert.equal(r.part2.ok, true, `part2 failed: ${r.part2.detail}`);
  assert.ok(probeStreams(r.part1.output).durSec > 1.0, 'part1 empty');
  assert.ok(probeStreams(r.part2.output).durSec > 1.0, 'part2 empty');
});

test('changeSpeed: audio-less input does NOT crash (BUG #4)', async () => {
  const src = makeClip('sp_src.mp4', { withAudio: false, dur: 3 });
  const out = path.join(TMP, 'speed_out.mp4');
  const r = await changeSpeed(src, out, 2);
  assert.equal(r.ok, true, `speed failed (audio-less crash?): ${r.detail}`);
  assert.ok(probeStreams(out).video, 'speed output missing video');
});

test('changeSpeed: audio input speed-changes both streams', async () => {
  const src = makeClip('spa_src.mp4', { withAudio: true, dur: 4 });
  const out = path.join(TMP, 'speed_a_out.mp4');
  const r = await changeSpeed(src, out, 2);
  assert.equal(r.ok, true, `speed(audio) failed: ${r.detail}`);
  const s = probeStreams(out);
  assert.ok(s.video && s.audio, 'speed(audio) lost a stream');
  // 2x speed → ~half the duration
  assert.ok(Math.abs(s.durSec - 2) < 0.5, `speed duration not halved: ${s.durSec}`);
});

test('mergeVideos: keeps audio when all inputs have it; no audio when none (BUG #11)', async () => {
  const a = makeClip('m1.mp4', { withAudio: true, dur: 2, color: 'red' });
  const b = makeClip('m2.mp4', { withAudio: true, dur: 2, color: 'green' });
  const out = path.join(TMP, 'merge_out.mp4');
  const r = await mergeVideos([a, b], out, 'landscape');
  assert.equal(r.ok, true, `merge failed: ${r.detail}`);
  const s = probeStreams(out);
  assert.ok(s.video && s.audio, 'merge dropped audio (BUG #11)');
  assert.ok(s.durSec > 3.5, `merge duration wrong: ${s.durSec}`);
});

test('mergeVideos: audio-less inputs merge without a=1 concat crash (BUG #11)', async () => {
  const a = makeClip('m3.mp4', { withAudio: false, dur: 2, color: 'red' });
  const b = makeClip('m4.mp4', { withAudio: false, dur: 2, color: 'green' });
  const out = path.join(TMP, 'merge_silent_out.mp4');
  const r = await mergeVideos([a, b], out, 'landscape');
  assert.equal(r.ok, true, `silent merge failed: ${r.detail}`);
  const s = probeStreams(out);
  assert.ok(s.video && !s.audio, 'silent merge should have video but no audio');
});

test('addAudio: mix onto a video with NO source audio (BUG #6)', async () => {
  const vid = makeClip('av_vid.mp4', { withAudio: false, dur: 2 });
  const aud = makeClip('av_aud.mp4', { withAudio: true, dur: 2, color: 'black' });
  const out = path.join(TMP, 'addaudio_out.mp4');
  const r = await addAudio(vid, aud, out, { mix: true, volume: 1 });
  assert.equal(r.ok, true, `addAudio(mix, no src audio) failed: ${r.detail}`);
  const s = probeStreams(out);
  assert.ok(s.video && s.audio, 'addAudio(mix) lost audio on no-src-audio video');
});

test('addProgressBar: durations defaults to real clip length, not bogus 10s (BUG #9)', async () => {
  const src = makeClip('pb_src.mp4', { withAudio: true, dur: 3 });
  const out = path.join(TMP, 'pb_out.mp4');
  const r = await addProgressBar(src, out, {});
  assert.equal(r.ok, true, `progressBar failed: ${r.detail}`);
  const s = probeStreams(out);
  // Bar should fill over the real 3s clip, not extend to 10s.
  assert.ok(Math.abs(s.durSec - 3) < 1.0, `progressBar changed duration to ${s.durSec}`);
});

test('silenceRemove: audio-less input fails gracefully, not crash (BUG #7)', async () => {
  const src = makeClip('sr_src.mp4', { withAudio: false, dur: 2 });
  const out = path.join(TMP, 'sr_out.mp4');
  const r = await silenceRemove(src, out);
  assert.equal(r.ok, false, 'silenceRemove should refuse audio-less input');
  assert.match(r.detail, /no audio/i);
});
