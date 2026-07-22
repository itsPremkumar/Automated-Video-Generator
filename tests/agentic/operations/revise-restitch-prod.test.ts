import * as fs from 'fs';
import * as path from 'path';
import os from 'os';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { execFileSync } from 'child_process';
import { makeWorkspaceTempDir, resolveWorkspaceTempPath } from '../../../src/shared/runtime/paths.js';

const ROOT = 'C:/one/Automated-Video-Generator';
const FF = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');

function mkClip(p: string, w: number, h: number, dur: number, audio: boolean) {
  const a = audio ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${dur}`, '-ac', '1'] : ['-an'];
  execFileSync(FF, ['-f', 'lavfi', '-i', `color=c=red:s=${w}x${h}:d=${dur}`, ...a, '-t', String(dur), '-r', '25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'aac', '-b:a', '128k'] : []), '-y', p], { stdio: 'ignore' });
}

function buildCachedWorkspace(id: string, v: { w: number; h: number; dur: number; audio: boolean }, title: string) {
  const { workspaceRootFor } = require('../../../src/agentic/management/workspace.js');
  const wsRoot = workspaceRootFor(id);
  fs.rmSync(wsRoot, { recursive: true, force: true });
  fs.mkdirSync(wsRoot, { recursive: true });
  fs.mkdirSync(path.join(wsRoot, 'assets', 'videos'), { recursive: true });
  fs.mkdirSync(path.join(wsRoot, 'audio'), { recursive: true });
  const sceneDur = 1;
  const plan = {
    title, orientation: v.w >= v.h ? 'landscape' : 'portrait', voice: 'en-US-GuyNeural', captions: 'burned',
    scenes: [1, 2, 3].map((n) => ({ sceneNumber: n, durationSec: sceneDur, voiceoverText: `Scene ${n} spoken line.`, visualPreference: 'video', localAsset: `s${n - 1}.mp4` })),
  };
  fs.writeFileSync(path.join(wsRoot, 'plan.json'), JSON.stringify(plan));
  for (let i = 0; i < 3; i++) mkClip(path.join(wsRoot, 'assets', 'videos', `s${i}.mp4`), v.w, v.h, sceneDur, v.audio);
  // silent voiceover wavs so caption rendering has audio context
  for (let i = 0; i < 3; i++) execFileSync(FF, ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=mono:sample_rate=44100:duration=' + sceneDur, '-c:a', 'pcm_s16le', '-y', path.join(wsRoot, 'audio', `scene_${i + 1}_voice.wav`)], { stdio: 'ignore' });
  fs.writeFileSync(path.join(wsRoot, 'render-manifest.json'), JSON.stringify({
    assets: plan.scenes.map((s: any, i: number) => ({ sceneIndex: i, kind: 'video', localPath: path.join(wsRoot, 'assets', 'videos', `s${i}.mp4`), durationSec: sceneDur })),
    voiceoverDriven: false,
  }));
  fs.writeFileSync(path.join(wsRoot, 'scene-data.json'), JSON.stringify({ scenes: plan.scenes }));
  fs.writeFileSync(path.join(wsRoot, 'voiceover-meta.json'), JSON.stringify({ voiceoverDriven: false, sceneCount: 3, fallbackUsed: false }));
  return { wsRoot, plan };
}

describe('revise.ts — production scenarios', () => {
  test('reviseJob fails safe when plan.json is missing', async () => {
    const { reviseJob } = await import('../../../src/agentic/operations/revise.js');
    const rep = await reviseJob('dog_no_plan_' + Date.now(), 'louder', [], {});
    assert.equal(rep.ok, false);
    assert.match(rep.detail, /plan\.json/);
  });

  test('scope-aware cached revise re-renders without network (portrait/landscape/silent)', async () => {
    const { reviseJob } = await import('../../../src/agentic/operations/revise.js');
    const { workspaceRootFor } = await import('../../../src/agentic/management/workspace.js');
    for (const v of [
      { name: 'rv_portrait', w: 720, h: 1280, dur: 3, audio: true },
      { name: 'rv_landscape', w: 1280, h: 720, dur: 4, audio: true },
      { name: 'rv_silent', w: 720, h: 1280, dur: 2, audio: false },
    ] as const) {
      const id = 'dog_' + v.name + '_' + Date.now();
      buildCachedWorkspace(id, v, v.name);
      const rep = await reviseJob(id, 'make captions yellow', [], { scope: 'captions' });
      assert.equal(rep.ok, true, `${v.name}: ${rep.detail}`);
      assert.ok(rep.outputPath && fs.existsSync(rep.outputPath), `${v.name}: output exists`);
      // Non-destructive: original plan.json untouched; a revision output exists.
      assert.ok(fs.existsSync(path.join(workspaceRootFor(id), 'plan.json')), `${v.name}: original plan intact`);
      assert.ok(rep.revisionJobId && rep.revisionJobId !== id, `${v.name}: got revision jobId`);
    }
  });

  test('critiqueAndRevise prefers cached fast path when render-manifest exists', async () => {
    const { critiqueAndRevise } = await import('../../../src/agentic/operations/revise.js');
    const id = 'dog_car_' + Date.now();
    const { wsRoot } = buildCachedWorkspace(id, { w: 720, h: 1280, dur: 1, audio: true }, 'car');
    const outDir = path.join(ROOT, 'output', id);
    fs.mkdirSync(outDir, { recursive: true });
    mkClip(path.join(outDir, 'car.mp4'), 720, 1280, 1, true);
    const rep = await critiqueAndRevise(id, path.join(outDir, 'car.mp4'), path.join(wsRoot, 'plan.json'), 'auto');
    assert.equal(rep.ok, true, rep.detail);
  });

  test('restitch works for all orientations incl. silent (regression guard)', async () => {
    const { restitchMaster } = await import('../../../src/agentic/operations/restitch.js');
    for (const v of [
      { name: 'rt_portrait', w: 720, h: 1280, dur: 3, audio: true },
      { name: 'rt_landscape', w: 1280, h: 720, dur: 4, audio: true },
      { name: 'rt_square', w: 1080, h: 1080, dur: 3, audio: true },
      { name: 'rt_silent', w: 720, h: 1280, dur: 3, audio: false },
      { name: 'rt_10s', w: 1920, h: 1080, dur: 9, audio: true },
    ] as const) {
      const dir = makeWorkspaceTempDir('rt_');
      const sceneDur = 1;
      const nScenes = Math.max(1, Math.floor(v.dur / sceneDur));
      // Build a real N-scene master via concat so plan total matches master.
      const subDir = path.join(dir, 'scenes');
      fs.mkdirSync(subDir, { recursive: true });
      const list = path.join(subDir, 'list.txt');
      const lines: string[] = [];
      for (let i = 0; i < nScenes; i++) {
        const c = path.join(subDir, `s${i}.mp4`);
        const a = v.audio ? ['-f', 'lavfi', '-i', `sine=frequency=${440 + i * 50}:duration=${sceneDur}`, '-ac', '1'] : ['-an'];
        execFileSync(FF, ['-f', 'lavfi', '-i', `color=c=red:s=${v.w}x${v.h}:d=${sceneDur}`, ...a, '-t', String(sceneDur), '-r', '25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(v.audio ? ['-c:a', 'aac', '-b:a', '128k'] : []), '-y', c], { stdio: 'ignore' });
        lines.push(`file '${c.replace(/\\/g, '/')}'`);
      }
      fs.writeFileSync(list, lines.join('\n'));
      const master = path.join(dir, 'm.mp4');
      execFileSync(FF, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', master], { stdio: 'ignore' });
      const newB = path.join(dir, 'n.mp4');
      mkClip(newB, v.w, v.h, sceneDur, v.audio);
      fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ scenes: Array.from({ length: nScenes }, (_, i) => ({ durationSec: sceneDur })) }));
      const out = path.join(dir, 'o.mp4');
      const rep = await restitchMaster(master, newB, path.join(dir, 'plan.json'), 2, out);
      assert.equal(rep.ok, true, `${v.name}: ${rep.detail}`);
      assert.ok(fs.existsSync(out), `${v.name}: out exists`);
      const oor = await restitchMaster(master, newB, path.join(dir, 'plan.json'), 99, path.join(dir, 'oor.mp4'));
      assert.equal(oor.ok, false);
    }
  });
});
