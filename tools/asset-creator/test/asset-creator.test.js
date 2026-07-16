'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ac = require('../src/index.js');

function tmpOut(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-creator-'));
  return path.join(dir, name);
}

function isMedia(p) {
  assert.ok(fs.existsSync(p), 'file should exist: ' + p);
  const sz = fs.statSync(p).size;
  assert.ok(sz > 0, 'file should be non-empty: ' + p + ' (' + sz + ' bytes)');
  return sz;
}

// ---- IMAGES ----
test('createBackgroundImage: gradient bg produced', () => {
  const out = tmpOut('bg.png');
  const r = ac.createBackgroundImage({ out, w: 360, h: 640, color1: '#1e3a8a', color2: '#0f172a' });
  assert.strictEqual(r, out);
  isMedia(out);
});

test('createTitleCard: title + subtitle rendered', () => {
  const out = tmpOut('title.png');
  ac.createTitleCard({ out, title: 'Home Workout', subtitle: '5 simple moves', w: 360, h: 640 });
  isMedia(out);
});

test('createQuoteCard: quote rendered', () => {
  const out = tmpOut('quote.png');
  ac.createQuoteCard({ out, quote: 'Discipline equals freedom.', author: 'Jocko', w: 360, h: 360 });
  isMedia(out);
});

// ---- VIDEO CLIPS ----
test('createKenBurnsClip: needs src image, produces mp4', () => {
  const img = tmpOut('bg.png');
  ac.createBackgroundImage({ out: img, w: 360, h: 640 });
  const out = tmpOut('kb.mp4');
  ac.createKenBurnsClip({ src: img, out, duration: 2, fps: 15 });
  isMedia(out);
});

test('createKenBurnsClip: throws without src', () => {
  assert.throws(() => ac.createKenBurnsClip({ out: tmpOut('x.mp4') }));
});

test('createKineticTextClip: produces mp4 with alpha text', () => {
  const out = tmpOut('kinetic.mp4');
  ac.createKineticTextClip({ out, text: 'Stay Hard', duration: 2, w: 360, h: 640, fps: 15 });
  isMedia(out);
});

test('createCountdownClip: 3..2..1 intro', () => {
  const out = tmpOut('countdown.mp4');
  ac.createCountdownClip({ out, from: 2, w: 360, h: 640, fps: 15 });
  isMedia(out);
});

// ---- AUDIO: BACKGROUND MUSIC ----
test('createBackgroundMusic: procedural ambient loop (no samples)', () => {
  const out = tmpOut('bgm.wav');
  ac.createBackgroundMusic({ out, duration: 3, freq: 220, gain: 0.2 });
  isMedia(out);
});

// ---- AUDIO: SFX ----
test('createSfx: whoosh/ding/impact/pop/click all produce audio', () => {
  for (const kind of ['whoosh', 'ding', 'impact', 'pop', 'click']) {
    const out = tmpOut(`sfx_${kind}.wav`);
    ac.createSfx({ out, kind });
    isMedia(out);
  }
});

test('createSfx: unknown kind throws', () => {
  assert.throws(() => ac.createSfx({ out: tmpOut('x.wav'), kind: 'nope' }));
});

// ---- GIF ----
test('createGif: from a clip', () => {
  const img = tmpOut('bg.png');
  ac.createBackgroundImage({ out: img, w: 360, h: 640 });
  const clip = tmpOut('kb.mp4');
  ac.createKenBurnsClip({ src: img, out: clip, duration: 2, fps: 15 });
  const gif = tmpOut('clip.gif');
  ac.createGif({ src: clip, out: gif, w: 240, fps: 8 });
  isMedia(gif);
});

test('createGif: throws without src', () => {
  assert.throws(() => ac.createGif({ out: tmpOut('x.gif') }));
});

// ---- PLACEHOLDER ----
test('createPlaceholder: branded fallback', () => {
  const out = tmpOut('ph.png');
  ac.createPlaceholder({ out, label: 'No image', w: 360, h: 640 });
  isMedia(out);
});

// ---- INTEGRATION: full free asset set for one scene ----
test('integration: build a complete free scene asset set', () => {
  const bg = tmpOut('bg.png');
  const title = tmpOut('title.png');
  const kb = tmpOut('kb.mp4');
  const bgm = tmpOut('bgm.wav');
  const sfx = tmpOut('sfx_whoosh.wav');
  const gif = tmpOut('clip.gif');
  ac.createBackgroundImage({ out: bg, w: 360, h: 640 });
  ac.createTitleCard({ out: title, title: 'Scene 1', w: 360, h: 640 });
  ac.createKenBurnsClip({ src: bg, out: kb, duration: 2, fps: 15 });
  ac.createBackgroundMusic({ out: bgm, duration: 3 });
  ac.createSfx({ out: sfx, kind: 'whoosh' });
  ac.createGif({ src: kb, out: gif, w: 240, fps: 8 });
  for (const f of [bg, title, kb, bgm, sfx, gif]) isMedia(f);
});
