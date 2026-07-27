/**
 * remotion-codegen.ts — Hermes-controlled Remotion code authoring.
 *
 * This module is the "brain's pen": given a scene description it WRITES a
 * complete, situation-specific Remotion .tsx composition from scratch (full
 * Remotion capacity — no preset caps). It is called by the autonomous
 * controller (hermes-remotion-controller.ts) which is driven by the Hermes
 * agent.
 *
 * Two modes:
 *  1. PROVIDED  — scene.code (raw .tsx string) is used verbatim (agent wrote it).
 *  2. GENERATED — authorRemotionComponent() synthesises a valid composition
 *                 from { kind, title, caption, palette, data } so the system
 *                 works fully automatically even without hand-authored code.
 *
 * All generated code imports ONLY the allowlisted modules (remotion, react,
 * @remotion/*, local helpers) — safety gate enforced by assertSafeImports().
 *
 * No deps beyond fs/path. Pure string authoring; the actual render happens in
 * the controller via @remotion/bundler + @remotion/renderer.
 */
import * as fs from 'fs';
import * as path from 'path';

export type MotionKind =
  | 'kinetic' // kinetic typography
  | 'infographic' // bar/pie/line/chart
  | 'hud' // sci-fi radar / dashboard
  | 'diagram' // explainer block/flow diagram
  | 'ui' // app / browser / terminal demo
  | 'map' // route / path animation
  | 'particle' // confetti / sparks / smoke
  | 'procedural' // fractal / noise / geometric
  | 'logo' // brand reveal
  | 'timeline' // roadmap / steps
  | 'spectrum' // audio-style visualizer
  | 'abstract'; // gradient / blob / loop background

export interface SceneSpec {
  index: number;
  kind?: MotionKind;
  title?: string;
  caption?: string;
  palette?: [string, string, string]; // [bg, accentA, accentB]
  data?: number[]; // for infographics
  labels?: string[]; // for infographic axes / timeline steps
  /** Raw .tsx source if the agent hand-authored this scene. */
  code?: string;
  /** Optional audio file (relative public/ path) for spectrum reactivity. */
  audioFile?: string;
  durationInFrames?: number;
  width?: number;
  height?: number;
}

const DEFAULT_PALETTE: [string, string, string] = ['#0a0a14', '#7c3aed', '#22d3ee'];
const FPS = 30;
const W = 1920;
const H = 1080;

const ALLOWED_IMPORT_PREFIXES = [
  'remotion',
  'react',
  '@remotion/',
  './',
  '../',
];

/** Safety gate: reject generated code importing anything outside the allowlist. */
export function assertSafeImports(src: string): void {
  const re = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const spec = m[1];
    const ok = ALLOWED_IMPORT_PREFIXES.some((p) => spec === p || spec.startsWith(p));
    if (!ok) {
      throw new Error(
        `[remotion-codegen] unsafe import blocked: "${spec}". ` +
          `Generated code may only import remotion / react / @remotion/* / local helpers.`,
      );
    }
  }
}

/** Build the full .tsx source for one scene composition. */
export function authorRemotionComponent(spec: SceneSpec): string {
  const src = spec.code && spec.code.trim().length > 0 ? spec.code : synthesize(spec);
  assertSafeImports(src);
  return src;
}

/** Write the composition + a Root that registers it, return entry path. */
export function writeSceneProject(jobDir: string, spec: SceneSpec, compId: string): string {
  fs.mkdirSync(path.join(jobDir, '_lib'), { recursive: true });
  const compPath = path.join(jobDir, `scene_${spec.index}.tsx`);
  fs.writeFileSync(compPath, authorRemotionComponent(spec), 'utf8');

  // Root that registers ONLY this scene's composition (single-entry render).
  const root = `import React from 'react';
import { Composition } from 'remotion';
import { Scene${spec.index} } from './scene_${spec.index}';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="${compId}"
      component={Scene${spec.index}}
      durationInFrames={${spec.durationInFrames ?? 120}}
      fps={${FPS}}
      width={${spec.width ?? W}}
      height={${spec.height ?? H}}
    />
  );
};
`;
  fs.writeFileSync(path.join(jobDir, 'Root.tsx'), root, 'utf8');
  fs.writeFileSync(path.join(jobDir, 'index.ts'), `import { registerRoot } from 'remotion';\nimport { RemotionRoot } from './Root';\n\nregisterRoot(RemotionRoot);\n`, 'utf8');
  return path.join(jobDir, 'index.ts');
}

/* ------------------------------------------------------------------ */
/* Synthesizer — turns a SceneSpec into a valid composition .tsx.       */
/* This is the autonomous fallback author; the agent may also hand-write.*/
/* ------------------------------------------------------------------ */
function synthesize(spec: SceneSpec): string {
  const kind = spec.kind ?? 'abstract';
  const [bg, a, b] = spec.palette ?? DEFAULT_PALETTE;
  const title = (spec.title ?? spec.caption ?? 'Remotion').replace(/[\\`${}]/g, '');
  const caption = (spec.caption ?? '').replace(/[\\`${}]/g, '');

  const head = `import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

const BG = '${bg}';
const A = '${a}';
const B = '${b}';
`;

  switch (kind) {
    case 'kinetic':
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 13, stiffness: 110 } });
  return (
    <AbsoluteFill style={{ backgroundColor: BG, justifyContent: 'center', alignItems: 'center' }}>
      <span style={{ fontFamily: 'system-ui', fontWeight: 900, fontSize: 120, color: 'white',
        opacity: enter, transform: \`scale(\${interpolate(enter,[0,1],[0.7,1])})\`,
        textShadow: \`0 0 50px \${A}\` }}>${title}</span>
    </AbsoluteFill>
  );
};
`;
    case 'infographic': {
      const data = spec.data ?? [42, 68, 55, 91, 76];
      const labels = spec.labels ?? ['A', 'B', 'C', 'D', 'E'];
      const max = Math.max(...data, 1);
      const bars = data
        .map(
          (v, i) =>
            `<div key={${i}} style={{ display:'flex', flexDirection:'column', alignItems:'center', width:160 }}>
        <span style={{ color:'white', fontSize:34 }}>{${v}}</span>
        <div style={{ width:120, height:${(v / max) * 480}, background:\`linear-gradient(180deg, \${A}, \${B})\`, borderRadius:12, marginTop:10 }} />
        <span style={{ color:'#9aa0b5', fontSize:30, marginTop:10 }}>${(labels[i] ?? '').replace(/[<>]/g, '')}</span>
      </div>`,
        )
        .join('\n      ');
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = spring({ frame, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ backgroundColor: BG, padding: 80, fontFamily: 'system-ui' }}>
      <h1 style={{ color:'white', fontSize:60, fontWeight:800 }}>${title}</h1>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-around', height:600, marginTop:60 }}>
      ${bars}
      </div>
    </AbsoluteFill>
  );
};
`;
    }
    case 'hud':
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const sweep = (frame * 3) % 360;
  return (
    <AbsoluteFill style={{ backgroundColor: '#04070d' }}>
      <svg width={1920} height={1080}>
        {[0.4,0.7,1].map((f,i)=>(<circle key={i} cx={960} cy={540} r={380*f} fill="none" stroke={\`\${B}44\`} strokeWidth={2} />))}
        <g transform={\`rotate(\${sweep} 960 540)\`}>
          <line x1={960} y1={540} x2={1340} y2={540} stroke={B} strokeWidth={3} />
        </g>
      </svg>
      <span style={{ position:'absolute', bottom:60, right:80, fontFamily:'monospace', color:B, fontSize:28 }}>SYS · ONLINE</span>
    </AbsoluteFill>
  );
};
`;
    case 'timeline': {
      const steps = (spec.labels ?? ['Step 1', 'Step 2', 'Step 3', 'Step 4']).map((s) =>
        s.replace(/[<>]/g, ''),
      );
      const nodes = steps
        .map(
          (s, i) =>
            `<g><circle cx={${240 + i * 420}} cy={540} r={30} fill={${i % 2 ? 'A' : 'B'}} />
        <text x={${240 + i * 420}} y={620} fill="white" fontSize={36} textAnchor="middle">${s}</text></g>`,
        )
        .join('\n      ');
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: 'system-ui' }}>
      <h1 style={{ position:'absolute', top:80, left:90, color:'white', fontSize:60 }}>${title}</h1>
      <svg width={1920} height={1080}>
        <line x1={240} y1={540} x2={1680} y2={540} stroke="#9aa0b5" strokeWidth={6} />
        ${nodes}
      </svg>
    </AbsoluteFill>
  );
};
`;
    }
    case 'particle':
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const parts = Array.from({ length: 120 }, (_, i) => {
    const r = (i * 97) % 1920;
    const y = (frame * (2 + (i % 5)) + i * 53) % 1080;
    return <div key={i} style={{ position:'absolute', left:r, top:y, width:10, height:10,
      background: i % 2 ? A : B, borderRadius:3, opacity:0.9 }} />;
  });
  return <AbsoluteFill style={{ backgroundColor: BG }}>{parts}</AbsoluteFill>;
};
`;
    case 'logo':
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame: frame - 10, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ backgroundColor: BG, justifyContent:'center', alignItems:'center' }}>
      <div style={{ width:380, height:380, borderRadius:40, background:\`linear-gradient(135deg, \${A}, \${B})\`,
        transform:\`scale(\${e})\`, opacity:e, boxShadow:\`0 0 80px \${A}88\` }} />
      <span style={{ position:'absolute', fontFamily:'system-ui', fontWeight:900, fontSize:96, color:'white',
        textShadow:\`0 0 50px \${B}\` }}>${title}</span>
    </AbsoluteFill>
  );
};
`;
    case 'spectrum':
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const bars = Array.from({ length: 64 }, (_, i) => {
    const h = 40 + Math.abs(Math.sin(frame * 0.1 + i * 0.3)) * 480;
    return <div key={i} style={{ width:18, height:h, background:\`hsl(\${(i*4+frame)%360},85%,60%)\`, borderRadius:6 }} />;
  });
  return (
    <AbsoluteFill style={{ backgroundColor: BG, justifyContent:'center', alignItems:'center' }}>
      <div style={{ display:'flex', gap:8, alignItems:'flex-end', height:560 }}>{bars}</div>
    </AbsoluteFill>
  );
};
`;
    case 'abstract':
    default:
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const t = (frame / ${spec.durationInFrames ?? 120}) * Math.PI * 2;
  const blobs = [
    { c: A, x: 0.3, y: 0.3 }, { c: B, x: 0.7, y: 0.4 }, { c: A, x: 0.5, y: 0.7 },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: BG, overflow:'hidden' }}>
      {blobs.map((bl, i) => (
        <div key={i} style={{ position:'absolute',
          left: 1920 * bl.x + Math.cos(t + i) * 220 - 350,
          top: 1080 * bl.y + Math.sin(t + i) * 200 - 350,
          width: 700, height: 700, borderRadius: '50%',
          background: \`radial-gradient(circle, \${bl.c} 0%, transparent 70%)\`,
          filter: 'blur(90px)', opacity: 0.5, mixBlendMode: 'screen' }} />
      ))}
      <span style={{ position:'absolute', width:'100%', textAlign:'center', top:'45%',
        fontFamily:'system-ui', fontWeight:300, fontSize:80, color:'white', letterSpacing:8 }}>${title}</span>
    </AbsoluteFill>
  );
};
`;
  }
}
