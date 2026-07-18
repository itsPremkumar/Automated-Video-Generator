/**
 * acquire.fallback.test.ts — verify the offline asset-creator fallback
 * (Integration #1). When a scene has no stock candidates, generateFallbackVisual
 * must produce a real local ffmpeg asset (zero network). Offline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateFallbackVisual } from './acquire.js';

test('generateFallbackVisual produces a real offline image fallback', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acq-fb-img-'));
  try {
    const fb = generateFallbackVisual({ voiceoverText: 'Morning coffee ritual', searchKeywords: ['coffee'] }, 'image', dir, 0);
    assert.ok(fb, 'fallback produced');
    assert.equal(fb!.source, 'asset-creator');
    assert.ok(fb!.localPath.endsWith('.jpg'), 'image output');
    assert.ok(fs.existsSync(fb!.localPath), 'file exists on disk');
    assert.ok(fs.statSync(fb!.localPath).size > 0, 'non-empty file');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('generateFallbackVisual produces a real offline video fallback', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acq-fb-vid-'));
  try {
    const fb = generateFallbackVisual({ voiceoverText: 'Workout montage', searchKeywords: ['gym'] }, 'video', dir, 0);
    assert.ok(fb, 'fallback produced');
    assert.ok(fb!.localPath.endsWith('.mp4'), 'video output');
    assert.ok(fs.existsSync(fb!.localPath), 'file exists on disk');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
