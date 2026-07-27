/**
 * hermes-remotion-controller.ts — the autonomous, Hermes-controlled Remotion
 * codegen + render + verify + integrate loop.
 *
 * Hermes (the agent) drives this. For a given agentic script, it:
 *   1. DECIDES which scenes are MOTION (tag [GenMotion] / [Motion:] or auto).
 *   2. CODEGENS a new .tsx per scene (remotion-codegen.authorRemotionComponent)
 *      into a per-job folder under remotion-generation/ (AVS-contained).
 *   3. RENDERS via @remotion/bundler + @remotion/renderer (reuses motion-render).
 *   4. VERIFIES — pluggable verifyFrame(): signal (ffprobe) + optional vision.
 *   5. SELF-FIXES — on failure, rewrites .tsx and re-renders (retry loop).
 *   6. FALLS BACK to stock/user asset if retries exhausted (never breaks video).
 *   7. INTEGRATES — moves verified clip to input/visuals/<job>_s<n>.mp4 and
 *      rewrites the script tag to [Visual: file] (reuses existing resolver).
 *
 * Fully automatic, no limits: Hermes may author any composition. The only
 * guard is assertSafeImports() (import allowlist) — a hard safety gate, not a
 * capability limit.
 */
import * as fs from 'fs';
import * as path from 'path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { resolveWorkspacePath, resolveProjectPath } from '../../shared/runtime/paths.js';
import { authorRemotionComponent, writeSceneProject, type SceneSpec, type MotionKind } from './remotion-codegen.js';
import { probeAsset } from './asset-checks.js';
import { verifyClip } from './remotion-verify.js';

/** A scene parsed from the agentic script that the controller may generate. */
export interface MotionScene {
  index: number;
  /** Raw tag value, e.g. 'NeuralNetwork' or 'infographic: Sales grew'. */
  tag?: string;
  /** Scene text (used to synthesize a composition when no hand-code given). */
  text: string;
  kind?: MotionKind;
  data?: number[];
  labels?: string[];
  palette?: [string, string, string];
  audioFile?: string;
  /** Hand-authored .tsx source (agent wrote it). If present, used verbatim. */
  code?: string;
  durationInFrames?: number;
}

export interface ControllerOptions {
  jobId: string;
  /** Hard cap on self-fix retries per scene. */
  maxRetries?: number;
  fps?: number;
  width?: number;
  height?: number;
  /** Pluggable VISION frame check. Enforces the "verified visually" bar inside
   *  the self-fix loop: extracted settled frame + content confirmation. In a
   *  real Hermes run this calls vision_analyze; offline tests pass a stub. */
  visionCheck?: (framePng: string, scene: { index: number; text: string; kind?: string }) => Promise<{ ok: boolean; note: string }>;
  /** If true, exhaust fallback to stock on repeated failure (default true). */
  allowFallback?: boolean;
}

export interface SceneResult {
  index: number;
  status: 'generated' | 'fallback' | 'skipped';
  /** Final visual path placed in input/visuals/ (for [Visual:] tag). */
  integratedPath?: string;
  note: string;
}

/**
 * Generate one scene: codegen -> write -> bundle -> render -> verify -> fix loop.
 * Returns the rendered MP4 path or null (caller decides fallback).
 */
async function generateOneScene(
  scene: MotionScene,
  opts: ControllerOptions,
): Promise<{ mp4: string | null; note: string }> {
  const jobDir = resolveWorkspacePath('remotion-generation', opts.jobId, `scene_${scene.index}`);
  fs.mkdirSync(jobDir, { recursive: true });
  const compId = `Scene${scene.index}`;
  const maxRetries = opts.maxRetries ?? 5;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 1. codegen (agent may have supplied code; else synthesize from spec)
    const spec: SceneSpec = {
      index: scene.index,
      kind: scene.kind,
      title: scene.text.slice(0, 60),
      caption: scene.text,
      data: scene.data,
      labels: scene.labels,
      palette: scene.palette,
      code: attempt === 0 ? scene.code : undefined, // retry -> re-synthesize (fresh)
      audioFile: scene.audioFile,
      durationInFrames: scene.durationInFrames ?? 120,
      width: opts.width ?? 1920,
      height: opts.height ?? 1080,
    };
    const entry = writeSceneProject(jobDir, spec, compId);

    // 2. render
    try {
      const bundleLoc = await bundle(entry);
      const composition = await selectComposition({
        serveUrl: bundleLoc,
        id: compId,
        inputProps: {},
      });
      composition.width = opts.width ?? 1920;
      composition.height = opts.height ?? 1080;
      composition.fps = opts.fps ?? 30;
      const outDir = resolveWorkspacePath('remotion-generation', opts.jobId, 'out');
      fs.mkdirSync(outDir, { recursive: true });
      const mp4 = path.join(outDir, `s${scene.index}.mp4`);
      await renderMedia({
        composition,
        serveUrl: bundleLoc,
        codec: 'h264',
        outputLocation: mp4,
        concurrency: 2,
      });

      // 3. verify (signal gate + optional vision content check in-loop)
      const vres = await verifyClip(
        mp4,
        { index: scene.index, text: scene.text, kind: scene.kind },
        {
          visionCheck: opts.visionCheck
            ? (frame, s) => opts.visionCheck!(frame, s)
            : undefined,
        },
      );
      if (vres.ok) return { mp4, note: `generated (attempt ${attempt})` };
      if (attempt === maxRetries) return { mp4: null, note: `verify failed: ${vres.note}` };
      // self-fix: re-synthesize next loop (agent could also patch .tsx here)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === maxRetries) return { mp4: null, note: `render failed: ${msg}` };
      // re-synthesize and retry
    }
  }
  return { mp4: null, note: 'exhausted retries' };
}

/**
 * Run the controller over a set of motion scenes. Integrates survivors into
 * input/visuals/ and returns per-scene results (for script-tag rewriting).
 */
export async function runRemotionController(
  scenes: MotionScene[],
  opts: ControllerOptions,
): Promise<SceneResult[]> {
  const visualsDir = resolveProjectPath('input', 'visuals');
  fs.mkdirSync(visualsDir, { recursive: true });
  const results: SceneResult[] = [];

  for (const scene of scenes) {
    const { mp4, note } = await generateOneScene(scene, opts);
    if (mp4) {
      const destName = `${opts.jobId}_s${scene.index}.mp4`;
      const dest = path.join(visualsDir, destName);
      fs.copyFileSync(mp4, dest);
      results.push({ index: scene.index, status: 'generated', integratedPath: dest, note });
    } else if (opts.allowFallback !== false) {
      results.push({ index: scene.index, status: 'fallback', note: `fell back to stock: ${note}` });
    } else {
      results.push({ index: scene.index, status: 'skipped', note });
    }
  }
  return results;
}

/**
 * Parse [GenMotion: ...] / [Motion: ...] tags out of a script string.
 * Returns the scene index -> tag mapping. Used by the planner/Hermes to
 * decide which scenes become MOTION.
 */
export function extractMotionTags(script: string): Record<number, string> {
  const tags: Record<number, string> = {};
  // split into sentences/scenes by newline (agentic script uses \n per scene)
  script.split('\n').forEach((line, i) => {
    const m = line.match(/\[(GenMotion|Motion):\s*([^\]]+)\]/i);
    if (m) tags[i] = m[2].trim();
  });
  return tags;
}

export { authorRemotionComponent, writeSceneProject };
