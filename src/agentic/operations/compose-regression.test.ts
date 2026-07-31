import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';
import { applyOverlays, crossfadeSlideshow } from './compose.js';

// ─────────────────────────────────────────────────────────────────────────────
// Empirical regressions for two REAL bugs found 2026-07-31 (compose campaign):
//   1. crossfadeSlideshow used `offset` BEFORE incrementing it → transition 0
//      fired at t=0 and every later offset was one scene early → the whole
//      chain degenerated and ffmpeg exited 0 with a video only ~scene-0 long
//      (7 scenes rendered as 8.08s instead of 48.6s). Silent truncation.
//   2. The overlay stage passed the filter chain inline via -vf; with kinetic
//      per-word captions × scenes the chain exceeds the Windows 32,767-char
//      command line → spawnSync ENAMETOOLONG → ALL text silently dropped.
//      Fixed with -filter_script:v (graph read from a file).
// ─────────────────────────────────────────────────────────────────────────────

const ff = require('ffmpeg-static') as string;
function ffprobe(): string {
    // ffprobe-static ships platform binaries under bin/<platform>.
    const base = require.resolve('ffprobe-static');
    const cands = [
        path.join(path.dirname(base), 'bin', 'win32', 'x64', 'ffprobe.exe'),
        path.join(path.dirname(base), 'bin', 'darwin', 'arm64', 'ffprobe'),
        path.join(path.dirname(base), 'bin', 'linux', 'x64', 'ffprobe'),
    ];
    for (const c of cands) if (fs.existsSync(c)) return c;
    throw new Error('ffprobe binary not found');
}
const FP = ffprobe();

function mkClip(file: string, color: string, secs: number, w = 320, h = 240): string {
    execFileSync(ff, ['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${w}x${h}:d=${secs}:r=25`, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', file], { stdio: 'ignore' });
    return file;
}

function durSec(p: string): number {
    const o = execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { encoding: 'utf8' });
    return parseFloat(o.trim());
}

const TMP = path.resolve('workspace', 'tmp', 'compose-regression');

test('crossfadeSlideshow keeps ALL scenes (xfade offset off-by-one regression)', () => {
    fs.mkdirSync(TMP, { recursive: true });
    try {
        const clips = [
            mkClip(path.join(TMP, 'c0.mp4'), 'red', 2),
            mkClip(path.join(TMP, 'c1.mp4'), 'green', 2),
            mkClip(path.join(TMP, 'c2.mp4'), 'blue', 2),
        ];
        const out = path.join(TMP, 'xfade_out.mp4');
        const got = crossfadeSlideshow(clips, 320, 240, out, [2, 2, 2], ['fade', 'slide'], 'fade', () => 0.4);
        assert.ok(got, 'crossfadeSlideshow must succeed');
        const d = durSec(got);
        // 2+2+2 - 2*0.4 = 5.2s expected. The off-by-one bug produced ~2.08s
        // (only the first scene's worth of media survived the degenerate graph).
        assert.ok(d > 4.2, `expected ~5.2s (all 3 scenes), got ${d}s — transitions truncated the chain`);
        assert.ok(d < 6.2, `unexpectedly long: ${d}s`);
    } finally {
        fs.rmSync(TMP, { recursive: true, force: true });
    }
});

test('applyOverlays survives a >32K-char filter chain (ENAMETOOLONG regression)', () => {
    fs.mkdirSync(TMP, { recursive: true });
    try {
        const base = mkClip(path.join(TMP, 'base.mp4'), 'orange', 3);
        // ~500 drawbox filters → chain well past the Windows 32,767-char
        // command-line limit that made spawnSync throw ENAMETOOLONG (which
        // silently dropped the entire overlay — captions/intro/outro).
        const vf: string[] = [];
        for (let i = 0; i < 500; i++) {
            const c = ['red', 'green', 'blue', 'white', 'yellow'][i % 5];
            vf.push(`drawbox=x=${(i * 3) % 300}:y=${(i * 7) % 220}:w=60:h=6:color=${c}@0.5:t=fill:enable='gte(t,0)*lt(t,3)'`);
        }
        const chain = vf.join(',');
        assert.ok(chain.length > 32767, `test precondition: chain must exceed 32,767 chars (got ${chain.length})`);
        const out = applyOverlays(base, vf, TMP);
        assert.notEqual(out, base, 'overlay must SUCCEED (return overlays.mp4), not silently fall back to base');
        assert.ok(fs.existsSync(out) && fs.statSync(out).size > 0, 'overlay output must exist and be non-empty');
        assert.ok(!fs.existsSync(path.join(TMP, 'overlays_filter.txt')), 'filter script file must be cleaned up');
        const d = durSec(out);
        assert.ok(d >= 2.8 && d <= 3.2, `overlay output should keep base duration ~3s, got ${d}`);
    } finally {
        fs.rmSync(TMP, { recursive: true, force: true });
    }
});
