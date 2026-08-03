/**
 * audio-track-audioless.test.ts — empirical verification of the AUDIO-LESS
 * fixes in audio-processor.ts (applyAutoDucking) + audio-track.ts (addAudioTrack).
 *
 *   BUG A5: applyAutoDucking(music, [audioLessVideo]) used to throw
 *           ("No such file: temp_combined_voice.mp3") because it did
 *           `[0:a]concat` on a stream-less video. Fix: probe each voice input
 *           for audio; if none, return the music unchanged (no ducking).
 *   BUG A6: addAudioTrack reported ok:true even when the output silently lost
 *           its audio track (silent/audio-less source). Fix: validate the
 *           output actually contains an audio stream; else report ok:false.
 *
 * Run: npx tsx --test src/agentic/operations/audio-track-audioless.test.ts
 */
import { test } from 'node:test';
import assert from 'assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { applyAutoDucking } from '../../lib/audio-processor.js';
import { addAudioTrack } from './audio-track.js';

const ffmpeg: string = require('ffmpeg-static');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-audioless-'));

function audioLessVideo(name: string, dur = 3): string {
  const p = path.join(TMP, name);
  execFileSync(ffmpeg, ['-f', 'lavfi', '-i', `color=c=blue:s=320x180:d=${dur}:r=25`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', String(dur), '-y', p], { stdio: 'ignore' });
  return p;
}
function realAudio(name: string, dur = 3): string {
  const p = path.join(TMP, name.replace(/\.[^.]+$/, '.wav'));
  execFileSync(ffmpeg, ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${dur}`, '-c:a', 'pcm_s16le', '-t', String(dur), '-y', p], { stdio: 'ignore' });
  return p;
}
function probeHasAudio(f: string): boolean {
  const out = execFileSync(require('ffprobe-static').path, ['-v', 'quiet', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f]).toString();
  // ffprobe emits CRLF on Windows — trim each line before comparing.
  return out.split('\n').some((l) => l.trim() === 'audio');
}

test('BUG A5: applyAutoDucking on AUDIO-LESS voice returns music (no throw)', async () => {
  const vid = audioLessVideo('a5_video.mp4');
  const music = realAudio('a5_music.mp3', 4);
  // Before the fix this throws ("No such file: temp_combined_voice.mp3").
  const out = await applyAutoDucking(music, [vid], TMP);
  assert.strictEqual(out, music, 'no audible voice → returns music path unchanged');
});

test('BUG A5: applyAutoDucking still ducks when a REAL voice track is present', async () => {
  const voice = realAudio('a5_voice.m4a', 3);
  const music = realAudio('a5_music2.mp3', 4);
  const out = await applyAutoDucking(music, [voice], TMP);
  assert.ok(fs.existsSync(out), 'ducked output produced when voice has audio');
  assert.ok(probeHasAudio(out), 'ducked output has an audio track');
});

test('BUG A6: addAudioTrack with a REAL audio file succeeds AND output keeps audio', async () => {
  const vid = audioLessVideo('a6_video.mp4');
  const tone = realAudio('a6_tone.m4a');
  const res = await addAudioTrack(vid, tone, path.join(TMP, 'a6_out.mp4'));
  assert.ok(res.ok, `addAudioTrack should succeed: ${res.detail}`);
  assert.ok(probeHasAudio(res.output!), 'output must contain the audio track');
});

test('BUG A6: addAudioTrack with a truly AUDIO-LESS audio file does not lie (ok:false)', async () => {
  const vid = audioLessVideo('a6c_video.mp4');
  // The "audio file" has NO audio stream at all (e.g. a mis-supplied clip).
  // `[1:a]` would match no stream → mux fails → must report ok:false, never ok:true.
  const noAudio = audioLessVideo('a6c_noaudio.mp4');
  const res = await addAudioTrack(vid, noAudio, path.join(TMP, 'a6c_out.mp4'));
  assert.strictEqual(res.ok, false, 'audio-less source must NOT report ok:true');
  assert.match(res.detail, /mux failed|no usable audio|audio track missing/i, 'detail explains the failure');
});
