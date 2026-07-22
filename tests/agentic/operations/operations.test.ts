import { makeWorkspaceTempDir, resolveWorkspaceTempPath } from '../../../src/shared/runtime/paths.js';
const __WS_TEST_TMP__ = resolveWorkspaceTempPath('tests');
/**
 * operations.test.ts — verify the single-task operations layer.
 *
 * - edit primitives run on REAL ffmpeg-static (no mocks).
 * - route.ts intent classification is pure heuristic logic (offline, no model).
 *
 * Fixtures use a Windows-valid temp dir (ffmpeg.exe is a Win binary and
 * cannot open POSIX /tmp/* paths) and clips WITH an audio track so copy-trim
 * and extract-audio exercise real streams.
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { mergeVideos, trimVideo, cropVideo, resizeVideo, rotateVideo, extractAudio } from '../../../src/agentic/operations/edit.js';
import { routeTask, isChain } from '../../../src/agentic/operations/route.js';
import { splitVideoEqual, splitVideoAt } from '../../../src/agentic/operations/split.js';
import { addCaptionsFromText } from '../../../src/agentic/operations/captions.js';
import { gradeVideo } from '../../../src/agentic/operations/grade.js';
import { slowMotion } from '../../../src/agentic/operations/motion.js';
import { addWatermark } from '../../../src/agentic/operations/overlay.js';
import { deriveFromVideo } from '../../../src/agentic/operations/derivative.js';

const ffmpeg: string = (() => {
    try {
        return require('ffmpeg-static');
    } catch {
        return 'ffmpeg';
    }
})();
const ffprobe: string = (() => {
    try {
        return require('ffprobe-static').path;
    } catch {
        return 'ffprobe';
    }
})();

// Some ffmpeg builds (e.g. minimal apt ffmpeg, or stripped static
// binaries) list drawtext in -filters but can't actually run it because
// fontconfig/libfreetype are missing ("Filter not found" at runtime).
// Skip filter-dependent integration tests gracefully when the filter can't
// really run, so CI on a minimal ffmpeg stays green (the test still
// runs on full builds).
function ffmpegCanRun(vf: string): boolean {
    try {
        const { execFileSync } = require('child_process');
        const tmpOut = path.join(__WS_TEST_TMP__, `ffprobe-smoke-${Date.now()}.mp4`);
        execFileSync(
            ffmpeg,
            ['-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=0.1', '-vf', vf, '-frames:v', '1', '-y', tmpOut],
            { stdio: 'ignore' },
        );
        try {
            fs.unlinkSync(tmpOut);
        } catch {
            /* ignore */
        }
        return true;
    } catch {
        return false; // filter present in -filters but can't execute -> treat as unavailable
    }
}

// Use the OS temp dir (works for ffmpeg.exe on Windows AND system ffmpeg on
// Linux/macOS — avoids a hardcoded Windows path that breaks CI on Linux).
const tmp = makeWorkspaceTempDir('_ops-test-');

/** Build a clip WITH an audio track (sine) so copy-trim/extract-audio are real. */
function makeClip(name: string, durSec = 2, color = 'blue'): string {
    const p = path.join(tmp, name);
    execFileSync(
        ffmpeg,
        [
            '-f',
            'lavfi',
            '-i',
            `color=c=${color}:s=720x1280:d=${durSec}`,
            '-f',
            'lavfi',
            '-i',
            `sine=frequency=440:duration=${durSec}`,
            '-pix_fmt',
            'yuv420p',
            '-c:v',
            'libx264',
            '-c:a',
            'aac',
            '-shortest',
            '-y',
            p,
        ],
        { stdio: 'ignore' },
    );
    return p;
}

function dur(file: string): number {
    const out = execFileSync(
        ffprobe,
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
        { encoding: 'utf-8' },
    );
    return parseFloat(out.trim()) || 0;
}

describe('edit primitives (real ffmpeg)', () => {
    test('merge two clips -> duration = sum', async () => {
        const a = makeClip('a.mp4', 2, 'blue');
        const b = makeClip('b.mp4', 3, 'red');
        const out = path.join(tmp, 'merged.mp4');
        const r = await mergeVideos([a, b], out, 'portrait');
        assert.equal(r.ok, true, r.detail);
        assert.ok(fs.existsSync(out));
        assert.ok(Math.abs(dur(out) - 5) < 1.0, `duration ~5s, got ${dur(out)}`);
    });

    test('trim to [1,3] -> ~2s', async () => {
        const a = makeClip('t.mp4', 4, 'green');
        const out = path.join(tmp, 'trimmed.mp4');
        const r = await trimVideo(a, out, 1, 3);
        assert.equal(r.ok, true, r.detail);
        assert.ok(Math.abs(dur(out) - 2) < 1.0, `duration ~2s, got ${dur(out)}`);
    });

    test('crop to 9:16 preset', async () => {
        const a = makeClip('c.mp4', 2, 'yellow');
        const out = path.join(tmp, 'cropped.mp4');
        const r = await cropVideo(a, out, { preset: '9:16' });
        assert.equal(r.ok, true, r.detail);
        assert.ok(fs.existsSync(out));
    });

    test('resize to 360x640', async () => {
        const a = makeClip('r.mp4', 2, 'purple');
        const out = path.join(tmp, 'resized.mp4');
        const r = await resizeVideo(a, out, 360, 640);
        assert.equal(r.ok, true, r.detail);
        assert.ok(fs.existsSync(out));
    });

    test('rotate 90', async () => {
        const a = makeClip('rot.mp4', 2, 'orange');
        const out = path.join(tmp, 'rotated.mp4');
        const r = await rotateVideo(a, out, 90);
        assert.equal(r.ok, true, r.detail);
        assert.ok(fs.existsSync(out));
    });

    test('extract audio -> mp3', async () => {
        const a = makeClip('e.mp4', 2, 'pink');
        const out = path.join(tmp, 'audio.mp3');
        const r = await extractAudio(a, out);
        assert.equal(r.ok, true, r.detail);
        assert.ok(out.endsWith('.mp3'));
        assert.ok(fs.existsSync(out));
    });
});

describe('new single-task ops (real ffmpeg)', () => {
    test('split into 2 equal parts -> 2 files ~half duration', async () => {
        const a = makeClip('sp.mp4', 4, 'blue');
        const out = path.join(tmp, 'split');
        const r = await splitVideoEqual(a, 2, out);
        assert.equal(r.ok, true, r.detail);
        assert.equal(r.outputs.length, 2);
        for (const o of r.outputs) {
            assert.ok(fs.existsSync(o), `missing ${o}`);
            assert.ok(Math.abs(dur(o) - 2) < 1.0, `part dur ~2s, got ${dur(o)}`);
        }
    });

    test('grade -> valid recoded clip', async () => {
        const a = makeClip('g.mp4', 2, 'blue');
        const out = path.join(tmp, 'graded.mp4');
        const r = await gradeVideo(a, 'cinematic', out);
        assert.equal(r.ok, true, r.detail);
        assert.ok(fs.existsSync(out));
        assert.ok(dur(out) > 1, `graded dur >1s, got ${dur(out)}`);
    });

    test('slow motion -> longer duration', async () => {
        const a = makeClip('sl.mp4', 2, 'green');
        const out = path.join(tmp, 'slow.mp4');
        const r = await slowMotion(a, 2, out);
        assert.equal(r.ok, true, r.detail);
        assert.ok(fs.existsSync(out));
        assert.ok(dur(out) > 3, `slow dur >3s, got ${dur(out)}`);
    });

    test('watermark -> valid clip', async () => {
        if (!ffmpegCanRun('drawtext')) return; // skip: minimal ffmpeg build
        const a = makeClip('wm.mp4', 2, 'red');
        const out = path.join(tmp, 'wm-out.mp4');
        const r = await addWatermark(a, 'BRAND', out);
        assert.equal(r.ok, true, r.detail);
        assert.ok(fs.existsSync(out));
    });

    test('derive -> produces multi-aspect + thumbnail', async () => {
        const a = makeClip('dv.mp4', 2, 'blue');
        const outDir = path.join(tmp, 'deriv');
        const r = await deriveFromVideo(a, ['9:16', '1:1'], true, outDir);
        assert.equal(r.ok, true, r.detail);
        assert.ok(r.outputs.length >= 2, `expected >=2, got ${r.outputs.length}`);
        for (const o of r.outputs) assert.ok(fs.existsSync(o), `missing ${o}`);
    });

    test('add captions from text -> valid clip', async () => {
        if (!ffmpegCanRun('drawtext')) return; // skip: minimal ffmpeg build
        const a = makeClip('cap.mp4', 2, 'blue');
        const out = path.join(tmp, 'cap-out.mp4');
        const r = await addCaptionsFromText(a, 'Hello world', out);
        assert.equal(r.ok, true, r.detail);
        assert.ok(fs.existsSync(out));
    });
});

describe('route.ts intent classification (heuristic, no model)', () => {
    const single = (p: string) => {
        const r = routeTask(p);
        return isChain(r) ? r.chain[0] : r;
    };
    test('classifies merge', () => {
        assert.equal(single('merge a.mp4 and b.mp4 into one video').kind, 'merge');
    });
    test('classifies trim with times', () => {
        const t = single('trim this clip from 10 to 20 seconds');
        assert.equal(t.kind, 'trim');
        assert.equal(t.args.start, 10);
        assert.equal(t.args.end, 20);
    });
    test('classifies crop to 9:16', () => {
        const t = single('crop this video to 9:16 for tiktok');
        assert.equal(t.kind, 'crop');
        assert.equal(t.args.preset, '9:16');
    });
    test('classifies resize', () => {
        assert.equal(single('resize this to 360x640').kind, 'resize');
    });
    test('classifies rotate', () => {
        const t = single('rotate the clip 90 degrees');
        assert.equal(t.kind, 'rotate');
        assert.equal(t.args.deg, 90);
    });
    test('classifies extract audio', () => {
        assert.equal(single('extract audio from my video').kind, 'separate_audio');
    });
    test('classifies voiceover', () => {
        const t = single('generate a voiceover of "welcome to my channel"');
        assert.equal(t.kind, 'voiceover');
        assert.ok((t.args.text || '').includes('welcome'));
    });
    test('classifies download image', () => {
        assert.equal(single('download an image of a coffee cup').kind, 'download_image');
    });
    test('classifies download video', () => {
        assert.equal(single('download a video of a city').kind, 'download_video');
    });
    test('classifies full video', () => {
        assert.equal(single('make a video about the benefits of morning walks').kind, 'full_video');
    });
    test('detects 2-step chain', () => {
        const t = routeTask('crop to 9:16 then add music');
        assert.ok(isChain(t));
        assert.equal(t.chain.length, 2);
    });
});
