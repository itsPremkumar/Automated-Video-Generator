/**
 * remotion-verify.ts — verification helpers for the autonomous controller.
 *
 * Two layers:
 *  - signalVerify(): ffprobe gate (dimensions/duration) — already in controller.
 *  - visionVerify(): extract a SETTLED frame (not mid-transition) and run a
 *    pluggable content check. In a real Hermes run the `visionCheck` callback
 *    calls vision_analyze; in tests it is a stub. This enforces the "verified
 *    visually" bar IN the self-fix loop, not just "did it render".
 */
import * as fs from 'fs';
import * as path from 'path';
import { probeAsset } from './asset-checks.js';
import { resolveWorkspacePath } from '../../shared/runtime/paths.js';

/** Extract a settled frame (default ~1s in, past the intro animation). */
export async function extractFrame(mp4: string, atSec = 1.0): Promise<string> {
  const ff = require('child_process').execFileSync;
  const outPng = path.join(
    resolveWorkspacePath('remotion-generation', '_frames'),
    `${path.basename(mp4, '.mp4')}.png`,
  );
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  const ffmpeg = require.resolve('ffmpeg-static');
  ff(ffmpeg, ['-y', '-ss', String(atSec), '-i', mp4, '-frames:v', '1', outPng], {
    stdio: 'ignore',
  });
  return outPng;
}

export interface VisionCheck {
  (framePng: string, scene: { index: number; text: string; kind?: string }): Promise<{
    ok: boolean;
    note: string;
  }>;
}

export interface VerifyResult {
  ok: boolean;
  signal: boolean;
  vision?: { ok: boolean; note: string };
  note: string;
}

/**
 * Full verify: signal gate + optional vision content check.
 * `visionCheck` is required to enforce the visual bar; if omitted, only signal
 * is checked (still valid, just not subject-confirmed).
 */
export async function verifyClip(
  mp4: string,
  scene: { index: number; text: string; kind?: string },
  opts: { visionCheck?: VisionCheck; frameAtSec?: number } = {},
): Promise<VerifyResult> {
  const p = await probeAsset(mp4);
  const signal = !!p && p.width > 0 && p.height > 0 && (p.durationSec ?? 0) > 0.05;
  if (!signal) return { ok: false, signal: false, note: `signal failed: ${JSON.stringify(p)}` };

  if (!opts.visionCheck) return { ok: true, signal: true, note: 'signal ok (no vision)' };

  const frame = await extractFrame(mp4, opts.frameAtSec ?? 1.0);
  const v = await opts.visionCheck(frame, scene);
  return { ok: v.ok, signal: true, vision: v, note: v.note };
}
