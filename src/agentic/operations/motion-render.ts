/**
 * motion-render.ts — render a single code-only Remotion composition to MP4.
 *
 * Reuses the EXACT machinery the legacy + agentic pipelines already use
 * (`@remotion/bundler` bundle() + `@remotion/renderer` selectComposition()/
 * renderMedia()). No new dependencies. Output lands inside the job workspace
 * (project root) to respect AVS containment — zero writes to system TEMP.
 *
 * After render, the clip is verified with the existing offline probeAsset()
 * (signal-level: dimensions + duration via ffprobe) so generated motion
 * graphics are held to the SAME evidence bar as downloaded assets.
 */
import * as fs from 'fs';
import * as path from 'path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { resolveMotion, type ResolvedMotion } from '../media/motion-resolver.js';
import { probeAsset } from '../media/asset-checks.js';
import { resolveWorkspacePath } from '../../shared/runtime/paths.js';

export interface MotionRenderRequest {
  /** Raw `[Motion:]` token or motionByScene value, e.g. `NeuralNetwork` or `BarChart@create`. */
  raw: string;
  /** Library map from AgenticConfig (optional). */
  libraries?: Record<string, string>;
  /** Data-driven props forwarded to the composition (title, data, colors...). */
  props?: Record<string, unknown>;
  /** Scene index, used for output naming + fps/aspect defaults. */
  sceneIndex: number;
  /** Fps (defaults to 30). */
  fps?: number;
  /** Width/Height (defaults 1920x1080). */
  width?: number;
  height?: number;
  /** Job id, used to namespace the output under the workspace. */
  jobId?: string;
}

export interface MotionRenderResult {
  resolved: ResolvedMotion;
  outputPath: string;
  durationInFrames: number;
  verified: boolean;
  /** Reason verification failed (empty if ok). */
  verifyNote: string;
}

/**
 * Render one motion-graphics clip. Throws if the library/composition can't be
 * resolved or the render fails — callers should catch and fall back to
 * stock/user visuals.
 */
export async function renderMotionClip(req: MotionRenderRequest): Promise<MotionRenderResult> {
  const resolved = resolveMotion(req.raw, req.libraries);
  const fps = req.fps ?? 30;
  const width = req.width ?? 1920;
  const height = req.height ?? 1080;

  const bundleLoc = await bundle(resolved.entryPoint);

  const inputProps = { ...(req.props ?? {}) };
  const composition = await selectComposition({
    serveUrl: bundleLoc,
    id: resolved.composition,
    inputProps,
  });

  // honour scene aspect if different from the composition default
  composition.width = width;
  composition.height = height;
  composition.fps = fps;

  const outDir = req.jobId
    ? resolveWorkspacePath('motion', req.jobId)
    : resolveWorkspacePath('motion');
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, `s${req.sceneIndex}_${resolved.composition}.mp4`);

  await renderMedia({
    composition,
    serveUrl: bundleLoc,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    concurrency: 2,
  });

  // Verify (offline, signal-level) — same bar as downloaded assets.
  const probe = await probeAsset(outputPath);
  const verified =
    !!probe &&
    probe.width === width &&
    probe.height === height &&
    (probe.durationSec ?? 0) > 0.1;
  const verifyNote = verified
    ? ''
    : `probe=${JSON.stringify(probe)} (expected ${width}x${height})`;

  return {
    resolved,
    outputPath,
    durationInFrames: composition.durationInFrames,
    verified,
    verifyNote,
  };
}
