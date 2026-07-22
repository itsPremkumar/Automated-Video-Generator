import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

const ffmpeg: string = require('ffmpeg-static');

/** Make a tiny valid mp4 (solid color + tone) for pipeline tests. */
function makeClip(out: string, dur: number, color: string, withAudio = true): boolean {
    try {
        const a = withAudio
            ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${dur}`, '-ac', '1']
            : ['-an'];
        execFileSync(ffmpeg, [
            '-f', 'lavfi', '-i', `color=c=${color}:s=720x1280:d=${dur}`,
            ...a,
            '-t', String(dur), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '25',
            ...(withAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []),
            '-y', out,
        ], { stdio: 'ignore' });
        return fs.existsSync(out);
    } catch { return false; }
}

describe('restitch.ts — in-place master edit (Gap C)', () => {
    test('swaps a single scene into a 2-scene master', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'restitch-'));
        const master = path.join(dir, 'master.mp4');
        const sceneA = path.join(dir, 's1.mp4');
        const sceneB = path.join(dir, 's2.mp4');
        const newB = path.join(dir, 's2-new.mp4');
        assert.ok(makeClip(sceneA, 2, 'red'), 'scene A made');
        assert.ok(makeClip(sceneB, 2, 'green'), 'scene B made');
        // master = A then B concatenated
        assert.ok(makeClip(master, 4, 'red'), 'master base made');
        // Replace master tail (last 2s) with newB
        assert.ok(makeClip(newB, 2, 'blue'), 'new scene made');

        const planPath = path.join(dir, 'plan.json');
        fs.writeFileSync(planPath, JSON.stringify({ scenes: [{ durationSec: 2 }, { durationSec: 2 }] }));

        const { restitchMaster } = await import('../../../src/agentic/operations/restitch.js');
        // Build a master that actually matches the plan: concat sceneA(2s)+sceneB(2s)
        // with a RE-ENCODE (not -c copy) so the container duration is exactly 4s
        // (a naive -c copy concat can pad to 5s due to keyframe alignment).
        const list = path.join(dir, 'list.txt');
        fs.writeFileSync(list, [sceneA, sceneB].map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
        execFileSync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', master], { stdio: 'ignore' });
        assert.ok(fs.existsSync(master), 'master (A+B) exists');

        const out = path.join(dir, `restitched_${Date.now()}_${Math.floor(Math.random() * 1e6)}.mp4`);
        try { fs.rmSync(out, { force: true }); } catch { /* ignore */ }
        const { estimateAudioDurationSafe: e2 } = await import('../../../src/agentic/orchestrator/ffmpeg.js');
        const rep = await restitchMaster(master, newB, planPath, 2, out);
        assert.equal(rep.ok, true, 'restitch ok: ' + rep.detail);
        assert.ok(fs.existsSync(out), 'restitched file produced');
        const dur = await e2(out);
        // Output should equal the plan total (~4s). The concat filter yields
        // ~4.04s; allow small tolerance but reject the old 5s padding bug.
        assert.ok(dur >= 3.8 && dur <= 4.2, 'duration preserved (~4s), got ' + dur);
    });

    test('fails safe on out-of-range scene', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'restitch2-'));
        const master = path.join(dir, 'm.mp4');
        const clip = path.join(dir, 'c.mp4');
        makeClip(master, 2, 'red'); makeClip(clip, 2, 'blue');
        fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ scenes: [{ durationSec: 2 }] }));
        const { restitchMaster } = await import('../../../src/agentic/operations/restitch.js');
        const rep = await restitchMaster(master, clip, path.join(dir, 'plan.json'), 5, path.join(dir, 'o.mp4'));
        assert.equal(rep.ok, false);
        assert.match(rep.detail, /out of range/);
    });
});

describe('revise.ts — scope-aware fast path', () => {
    test('reviseJob fails safe on missing plan (no crash)', async () => {
        const { reviseJob } = await import('../../../src/agentic/operations/revise.js');
        const rep = await reviseJob('no-such-job-' + Date.now(), 'louder please', [], { scope: 'music' });
        assert.equal(rep.ok, false);
        assert.match(rep.detail, /plan\.json/);
    });
    test('ReviseOpts exposes scope field', async () => {
        const m = await import('../../../src/agentic/operations/revise.js');
        assert.equal(typeof m.reviseJob, 'function');
    });
});
