/**
 * integration.test.ts — real-clip integration for the new single-task ops.
 *
 * Generates a tiny synthetic clip with the bundled ffmpeg-static and runs a
 * chain of ops (reframe -> slow-motion -> multi-aspect derive) end-to-end.
 * If ffmpeg-static is unavailable (or the ffmpeg binary can't execute on
 * this host) the whole suite skips with a clear reason instead of failing —
 * matching the repo's "skip, don't break CI on minimal environments" policy.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let ffmpeg: string;
try {
    ffmpeg = require('ffmpeg-static');
} catch {
    ffmpeg = 'ffmpeg';
}

// Skip the entire suite if ffmpeg can't actually run (no binary / no exec).
function ffmpegRuns(): boolean {
    try {
        const { execFileSync } = require('child_process');
        execFileSync(ffmpeg, ['-version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function makeClip(p: string, dur: number, color: string): void {
    const { execFileSync } = require('child_process');
    execFileSync(
        ffmpeg,
        ['-f', 'lavfi', '-i', `color=c=${color}:s=720x1280:r=25:d=${dur}`, '-pix_fmt', 'yuv420p', '-y', p],
        { stdio: 'ignore' },
    );
}

const canRun = ffmpegRuns();
const maybe = canRun ? test : test.skip;

describe('integration: real-clip op chain', () => {
    let tmp: string;
    let src: string;

    // Generate the source clip once for the suite.
    if (canRun) {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avg-integration-'));
        src = path.join(tmp, 'src.mp4');
        makeClip(src, 2, 'teal');
    }

    maybe('reframe -> slowMotion -> derive runs end-to-end on a real clip', async () => {
        const { autoReframe } = await import('./reframe.js');
        const { slowMotion } = await import('./motion.js');
        const { deriveFromVideo } = await import('./derivative.js');

        const reframed = path.join(tmp, 'reframed.mp4');
        const r1 = await autoReframe(src, reframed, { preset: '1:1' });
        assert.equal(r1.ok, true, r1.detail);
        assert.ok(fs.existsSync(reframed), 'reframed clip exists');

        const slowed = path.join(tmp, 'slowed.mp4');
        const r2 = await slowMotion(reframed, 2, slowed);
        assert.equal(r2.ok, true, r2.detail);
        assert.ok(fs.existsSync(slowed), 'slowed clip exists');

        const derivDir = path.join(tmp, 'deriv');
        const r3 = await deriveFromVideo(slowed, ['9:16', '16:9'], true, derivDir);
        assert.equal(r3.ok, true, r3.detail);
        assert.ok(r3.outputs.length >= 2, `expected >=2 derivs, got ${r3.outputs.length}`);
        for (const o of r3.outputs) assert.ok(fs.existsSync(o), `missing ${o}`);
    });
});
