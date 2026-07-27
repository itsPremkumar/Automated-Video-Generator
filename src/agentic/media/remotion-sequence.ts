/**
 * remotion-sequence.ts — full-capacity rendering: one bundle, transitions
 * between scenes, plus still-image generation.
 *
 *  - renderSequence(): authors a single Root that stacks all scene
 *    compositions inside a <TransitionSeries> with crossZoom/filmBurn/
 *    linearBlur between them, renders ONCE (fast, uses native Remotion
 *    transitions — the headline feature missing from standalone concat).
 *  - renderStillClip(): uses renderStill to emit a generated PNG (cover /
 *    lower-third / thumbnail) into input/visuals/.
 *
 * Both reuse remotion-codegen (per-scene authoring) and the existing render
 * machinery from @remotion/bundler + @remotion/renderer.
 */
import * as fs from 'fs';
import * as path from 'path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import {
  authorRemotionComponent,
  type SceneSpec,
} from './remotion-codegen.js';
import { resolveWorkspacePath, resolveProjectPath } from '../../shared/runtime/paths.js';

export type TransitionName = 'crossZoom' | 'filmBurn' | 'linearBlur' | 'slide' | 'wipe' | 'none';

export interface SequenceScene {
  index: number;
  kind?: SceneSpec['kind'];
  text: string;
  data?: number[];
  labels?: string[];
  palette?: [string, string, string];
  durationInFrames?: number;
  /** transition INTO this scene from the previous one. */
  transition?: TransitionName;
}

const FPS = 30;
const W = 1920;
const H = 1080;
const TRANSITION_FRAMES = 20;

/** Build a Root that renders all scenes as a TransitionSeries. */
function writeSequenceProject(
  jobDir: string,
  scenes: SequenceScene[],
  compId: string,
  allowShaderTransitions = false,
): string {
  fs.mkdirSync(jobDir, { recursive: true });
  const specs: SceneSpec[] = scenes.map((s) => ({
    index: s.index,
    kind: s.kind,
    title: s.text.slice(0, 60),
    caption: s.text,
    data: s.data,
    labels: s.labels,
    palette: s.palette,
    durationInFrames: s.durationInFrames ?? 120,
    width: W,
    height: H,
  }));
  // write each scene comp
  specs.forEach((sp) => {
    fs.writeFileSync(path.join(jobDir, `scene_${sp.index}.tsx`), authorRemotionComponent(sp), 'utf8');
  });

  const imports = scenes
    .map((s) => `import { Scene${s.index} } from './scene_${s.index}';`)
    .join('\n');
  // Shader/canvas transitions (crossZoom/filmBurn/linearBlur/wipe/dissolve)
  // use WebGL canvas that hangs under headless Chrome without a GPU. Default
  // every transition to `slide` (pure CSS transform, headless-safe); only use
  // the richer transitions when a GPU is present (allowShaderTransitions).
  const useShader = Boolean(allowShaderTransitions);
  const safe = (t: string): string => (useShader ? t : 'slide');
  const series = scenes
    .map((s, i) => {
      const body = `        <TransitionSeries.Sequence durationInFrames={${s.durationInFrames ?? 120}}>
          <Scene${s.index} />
        </TransitionSeries.Sequence>`;
      if (i === 0 || s.transition === 'none') return body;
      const t = safe(s.transition ?? 'slide');
      const pres =
        t === 'filmBurn'
          ? `filmBurn()`
          : t === 'linearBlur'
            ? `linearBlur()`
            : t === 'crossZoom'
              ? `crossZoom()`
              : t === 'wipe'
                ? `wipe({ direction: 'from-right' })`
                : t === 'dissolve'
                  ? `dissolve()`
                  : `slide({ direction: 'from-right' })`;
      return `        <TransitionSeries.Transition presentation={${pres}} timing={linearTiming({ durationInFrames: ${TRANSITION_FRAMES} })} />
${body}`;
    })
    .join('\n');

  const root = `import React from 'react';
import { Composition } from 'remotion';
import { TransitionSeries, linearTiming, crossZoom, filmBurn, linearBlur } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { dissolve } from '@remotion/transitions/dissolve';
${imports}

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="${compId}"
      component={() => (
        <TransitionSeries>
${series}
        </TransitionSeries>
      )}
      durationInFrames={${scenes.reduce((a, s) => a + (s.durationInFrames ?? 120) + (s.transition && s.transition !== 'none' ? TRANSITION_FRAMES : 0), 0)}}
      fps={${FPS}}
      width={${W}}
      height={${H}}
    />
  );
};
`;
  fs.writeFileSync(path.join(jobDir, 'Root.tsx'), root, 'utf8');
  fs.writeFileSync(
    path.join(jobDir, 'index.ts'),
    `import { registerRoot } from 'remotion';\nimport { RemotionRoot } from './Root';\n\nregisterRoot(RemotionRoot);\n`,
    'utf8',
  );
  return path.join(jobDir, 'index.ts');
}

export async function renderSequence(
  scenes: SequenceScene[],
  opts: { jobId: string; fps?: number; outName?: string; allowShaderTransitions?: boolean },
): Promise<string> {
  const jobDir = resolveWorkspacePath('remotion-generation', opts.jobId, 'sequence');
  const entry = writeSequenceProject(jobDir, scenes, 'Sequence', opts.allowShaderTransitions);
  const bundleLoc = await bundle(entry);
  const composition = await selectComposition({ serveUrl: bundleLoc, id: 'Sequence', inputProps: {} });
  composition.width = W;
  composition.height = H;
  composition.fps = opts.fps ?? FPS;
  const outDir = resolveWorkspacePath('remotion-generation', opts.jobId, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const mp4 = path.join(outDir, opts.outName ?? 'sequence.mp4');
  await renderMedia({ composition, serveUrl: bundleLoc, codec: 'h264', outputLocation: mp4, concurrency: 2, chromiumOptions: { gl: 'swiftshader' } });
  return mp4;
}

/**
 * Generate a still PNG (cover / lower-third / thumbnail) from a scene spec.
 * Implements the user's ask: "Remotion should also generate images."
 */
export async function renderStillClip(
  scene: SequenceScene,
  opts: { jobId: string; outName?: string },
): Promise<string> {
  const jobDir = resolveWorkspacePath('remotion-generation', opts.jobId, 'stills');
  fs.mkdirSync(jobDir, { recursive: true });
  const spec: SceneSpec = {
    index: scene.index,
    kind: scene.kind,
    title: scene.text.slice(0, 60),
    caption: scene.text,
    data: scene.data,
    labels: scene.labels,
    palette: scene.palette,
    durationInFrames: scene.durationInFrames ?? 120,
    width: W,
    height: H,
  };
  fs.writeFileSync(path.join(jobDir, `still_${scene.index}.tsx`), authorRemotionComponent(spec), 'utf8');
  const root = `import React from 'react';
import { Composition } from 'remotion';
import { Scene${scene.index} } from './still_${scene.index}';
export const RemotionRoot: React.FC = () => (
  <Composition id="Still" component={Scene${scene.index}} durationInFrames={120} fps={30} width={${W}} height={${H}} />
);
`;
  fs.writeFileSync(path.join(jobDir, 'Root.tsx'), root, 'utf8');
  fs.writeFileSync(
    path.join(jobDir, 'index.ts'),
    `import { registerRoot } from 'remotion';\nimport { RemotionRoot } from './Root';\n\nregisterRoot(RemotionRoot);\n`,
    'utf8',
  );
  const bundleLoc = await bundle(path.join(jobDir, 'index.ts'));
  const composition = await selectComposition({ serveUrl: bundleLoc, id: 'Still', inputProps: {} });
  const visualsDir = resolveProjectPath('input', 'visuals');
  fs.mkdirSync(visualsDir, { recursive: true });
  const png = path.join(visualsDir, opts.outName ?? `${opts.jobId}_s${scene.index}.png`);
  await renderStill({
    composition,
    serveUrl: bundleLoc,
    output: png,
    frame: 30, // settled frame
    chromiumOptions: { gl: 'swiftshader' },
  });
  return png;
}
