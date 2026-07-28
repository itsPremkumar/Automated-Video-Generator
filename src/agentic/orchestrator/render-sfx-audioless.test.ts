/**
 * render-sfx-audioless.test.ts — empirical verification of the M5 render.ts fix:
 * SFX (cut sound effects) must work EVEN WHEN THERE IS NO MUSIC and NO
 * voiceover (i.e. the silent track is audio-less). The fix added an `else if`
 * branch that mixes the SFX layer with proper audio-less handling.
 *
 * Before the fix, `sfx` was gated on `music` being present, so an sfx:true /
 * music:false render would hit the plain `renameSync(silent, out)` branch and
 * the SFX layer was silently discarded (no audio in output). After the fix, the
 * `else if` branch mixes the SFX layer and the output keeps an audio track.
 *
 * Run: npx tsx --test src/agentic/orchestrator/render-sfx-audioless.test.ts
 */
import { test } from 'node:test';
import assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { renderAgenticSlideshow } from './render.js';

const VIS = path.resolve('input/visuals');

function makeRes(jobId: string, clipNames: string[], opts: any) {
  const assets = clipNames.map((name, i) => ({
    kind: 'video' as const,
    sceneIndex: i,
    localPath: path.join(VIS, name),
  }));
  const manifest = { assets, voiceovers: [] };
  const plan = { scenes: clipNames.map((_, i) => ({ idx: i, kenBurns: false, caption: '', kinetic: [] })) };
  return {
    backend: 'agent',
    plan,
    workspace: { jobId, root: path.resolve(`output/variety/${jobId}`), assetsDir: '', imagesDir: '', videosDir: '', musicDir: '', verificationDir: '', audioDir: '' },
    manifest,
    gate: { pass: true },
    media: { assets: [], music: null, voiceover: { byScene: {} } },
  } as any;
}

function probeHasAudio(f: string): boolean {
  const out = require('child_process').execFileSync(require('ffprobe-static').path, ['-v', 'quiet', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f]).toString();
  return out.split('\n').some((l: string) => l.trim() === 'audio');
}

test('M5: sfx:true with NO music and NO voiceover (audio-less silent) still mixes SFX → output has audio', async () => {
  const jobId = `m5_sfx_${Date.now()}`;
  const outDir = `output/variety/${jobId}`;
  fs.mkdirSync(outDir, { recursive: true });
  const opts = { orientation: '9:16' as const, kenBurns: false, sfx: true, music: false, preset: 'default' as const };
  const res = makeRes(jobId, ['a.mp4', 'b.mp4'], opts);
  const out = path.join(outDir, 'render', `${jobId}_9x16.mp4`);
  try {
    await renderAgenticSlideshow(res, opts);
  } catch (e: any) {
    assert.fail(`render threw: ${String(e?.message ?? e).slice(0, 200)}`);
  }
  assert.ok(fs.existsSync(out), 'output produced');
  // The SFX layer should have been mixed in → output carries an audio track.
  assert.ok(probeHasAudio(out), 'output must contain the SFX audio track (M5 else-if branch)');
  // Cleanup
  try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* ignore */ }
});
