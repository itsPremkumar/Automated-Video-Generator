/**
 * edit-regression.test.ts — regression coverage for the REAL ffmpeg bugs found
 * during the multi-agent bug hunt (findings_editing.md):
 *   BUG#1 trimVideo  -> empty output on non-keyframe split (was -c copy)
 *   BUG#2 splitVideo -> both parts empty (was -c copy)
 *   BUG#3 interpolateVideo -> always failed (mode=blend -> mi_mode=blend)
 *   BUG#4 changeSpeed -> crashed on audio-less input (hardcoded [0:a])
 *   BUG#5 changeSpeed -> slow <0.5x failed (atempo range)
 *   BUG#6 addAudio(mix) -> failed on audio-less video (amix needs 2 inputs)
 *   BUG#7 silenceRemove -> misleading success on audio-less / desync
 *   BUG#9 addProgressBar -> default 10s duration (bar never filled)
 *   BUG#10 cropVideo preset -> non-exact SAR (missing setsar=1)
 *   BUG#11 mergeVideos -> silently dropped all audio
 *
 * Self-seeding: generates tiny fixtures with the bundled ffmpeg-static at
 * runtime (no committed binaries). Skips cleanly if ffmpeg-static is absent.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
    trimVideo, splitVideo, interpolateVideo, changeSpeed,
    addAudio, silenceRemove, addProgressBar, mergeVideos, cropVideo,
} from './edit';

let ffmpeg: string;
try { ffmpeg = require('ffmpeg-static'); } catch { ffmpeg = 'ffmpeg'; }

function hasFfmpeg(): boolean {
    try { execFileSync(ffmpeg, ['-version'], { timeout: 10000 }); return true; }
    catch { return false; }
}
function ffprobeDuration(file: string): number | null {
    try {
        const bin = require('ffprobe-static').path;
        const out = execFileSync(bin, ['-v', 'quiet', '-print_format', 'json', '-show_format', file], { timeout: 15000 }).toString();
        const d = parseFloat(JSON.parse(out)?.format?.duration);
        return Number.isFinite(d) ? d : null;
    } catch { return null; }
}
function hasAudio(file: string): boolean {
    try {
        const bin = require('ffprobe-static').path;
        const out = execFileSync(bin, ['-v', 'quiet', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { timeout: 15000 }).toString();
        return out.trim().length > 0;
    } catch { return false; }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-edit-'));
let noAudio: string;
let withAudio: string;
let tone: string;

test.before(async () => {
    if (!hasFfmpeg()) return;
    noAudio = path.join(TMP, 'noaudio.mp4');
    withAudio = path.join(TMP, 'withaudio.mp4');
    tone = path.join(TMP, 'tone.mp3');
    execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', noAudio], { timeout: 60000 });
    execFileSync(ffmpeg, ['-y', '-i', noAudio, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'copy', '-c:a', 'aac', '-shortest', withAudio], { timeout: 60000 });
    execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'libmp3lame', tone], { timeout: 60000 });
});

test.after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore cleanup errors */ } });

const skip = hasFfmpeg() ? {} : { skip: 'ffmpeg-static unavailable' };

test('BUG#1 trimVideo produces a real (non-empty) clip', skip, async () => {
    const r = await trimVideo(noAudio, path.join(TMP, 'trim.mp4'), 0.2, 1.5);
    assert.equal(r.ok, true);
    assert.ok(fs.statSync(r.output).size > 1000, 'trim output was empty');
    assert.ok((ffprobeDuration(r.output) ?? 0) > 0.5, 'trim duration ~0');
});

test('BUG#2 splitVideo both parts playable', skip, async () => {
    const s = await splitVideo(noAudio, 1, path.join(TMP, 'p1.mp4'), path.join(TMP, 'p2.mp4'));
    assert.equal(s.part1.ok, true);
    assert.equal(s.part2.ok, true);
    assert.ok(fs.statSync(s.part1.output).size > 1000);
    assert.ok(fs.statSync(s.part2.output).size > 1000);
});

test('BUG#3 interpolateVideo no longer fails (mi_mode=blend)', skip, async () => {
    const r = await interpolateVideo(noAudio, path.join(TMP, 'inter.mp4'), 30);
    assert.equal(r.ok, true, 'interpolate failed: ' + r.detail);
});

test('BUG#4 changeSpeed works on audio-less video', skip, async () => {
    const r = await changeSpeed(noAudio, path.join(TMP, 'sp.mp4'), 2);
    assert.equal(r.ok, true, 'changeSpeed crashed on audio-less input: ' + r.detail);
});

test('BUG#5 changeSpeed 0.25x slow-motion works (chained atempo)', skip, async () => {
    const r = await changeSpeed(noAudio, path.join(TMP, 'slow.mp4'), 0.25);
    assert.equal(r.ok, true, '0.25x slow-mo failed: ' + r.detail);
});

test('BUG#6 addAudio(mix) on audio-less video works', skip, async () => {
    const r = await addAudio(noAudio, tone, path.join(TMP, 'mix.mp4'), { mix: true });
    assert.equal(r.ok, true, 'mix on audio-less video failed: ' + r.detail);
    assert.ok(hasAudio(r.output), 'mixed output has no audio');
});

test('BUG#7 silenceRemove fails loud on audio-less input', skip, async () => {
    const r = await silenceRemove(noAudio, path.join(TMP, 'nosil.mp4'));
    assert.equal(r.ok, false, 'should have failed (no audio track)');
});

test('BUG#9 addProgressBar probes real duration (not hardcoded 10s)', skip, async () => {
    const r = await addProgressBar(noAudio, path.join(TMP, 'pb.mp4'));
    assert.equal(r.ok, true);
    assert.ok((ffprobeDuration(r.output) ?? 99) < 5, 'progress bar used wrong duration');
});

test('BUG#10 cropVideo 9:16 yields square pixels (setsar=1)', skip, async () => {
    const r = await cropVideo(noAudio, path.join(TMP, 'crop.mp4'), { preset: '9:16' });
    assert.equal(r.ok, true);
    const bin = require('ffprobe-static').path;
    const out = execFileSync(bin, ['-v', 'quiet', '-select_streams', 'v', '-show_entries', 'stream=sample_aspect_ratio', '-of', 'csv=p=0', r.output], { timeout: 15000 }).toString();
    assert.match(out.trim(), /^(1:1|1\/1)$/, 'SAR not square: ' + out);
});

test('BUG#11 mergeVideos keeps audio when inputs have it', skip, async () => {
    const r = await mergeVideos([withAudio, withAudio], path.join(TMP, 'merged.mp4'), 'landscape');
    assert.equal(r.ok, true, 'merge failed: ' + r.detail);
    assert.ok(hasAudio(r.output), 'merged output lost audio');
});
