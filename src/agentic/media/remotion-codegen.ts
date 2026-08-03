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
  /** Random seed for retry variation. Changes behavior on each retry. */
  variant?: number;
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

/** Clean old bundle artifacts before retry. */
export function cleanSceneProject(jobDir: string): void {
  const outDir = path.join(jobDir, '..', 'out');
  if (fs.existsSync(outDir)) {
    for (const f of fs.readdirSync(outDir)) {
      try { fs.rmSync(path.join(outDir, f), { recursive: true }); } catch { /* ignore */ }
    }
  }
  // Clear cached node_modules bundled output
  const cacheDir = path.join(jobDir, 'node_modules', '.cache');
  if (fs.existsSync(cacheDir)) {
    try { fs.rmSync(cacheDir, { recursive: true }); } catch { /* ignore */ }
  }
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
  const v = spec.variant ?? 0; // retry variation seed

  // Calculate pseudo-random offset from variant for retry diversity
  const vOff = (v * 137.508) % 360;

  const head = `import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, random } from 'remotion';

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
      // Animated bars: each bar grows to its target height using spring
      const bars = data
        .map(
          (v, i) =>
            `<div key={${i}} style={{ display:'flex', flexDirection:'column', alignItems:'center', width:160 }}>
        <span style={{ color:'white', fontSize:34 }}>{${v}}</span>
        <div style={{ width:120, height:interpolate(spring({ frame: frame - ${i * 2}, fps, config: { damping: 18 } }), [0,1], [0,${(v / max) * 480}]), background:\`linear-gradient(180deg, \${A}, \${B})\`, borderRadius:12, marginTop:10 }} />
        <span style={{ color:'#9aa0b5', fontSize:30, marginTop:10 }}>${(labels[i] ?? '').replace(/[<>]/g, '')}</span>
      </div>`,
        )
        .join('\\n      ');
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
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
    case 'diagram': {
      // Flow diagram: animated blocks connected by lines
      const blocks = (spec.labels ?? ['Input', 'Process', 'Output']).map(s => s.replace(/[<>]/g, ''));
      const blockEls = blocks.map((s, i) => {
        const x = 960 + (i - (blocks.length - 1) / 2) * 400;
        return `<g>
          <rect x={${x - 100}} y={420} width={200} height={200} rx={16} fill={${i % 2 ? 'A' : 'B'}} opacity={spring({ frame: frame - ${i * 5}, fps, config: { damping: 14 } })} />
          <text x={${x}} y={530} fill="white" fontSize={36} textAnchor="middle" fontWeight={700}>${s}</text>
        </g>`;
      }).join('\\n        ');
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: 'system-ui' }}>
      <h1 style={{ position:'absolute', top:60, left:90, color:'white', fontSize:48 }}>${title}</h1>
      <svg width={1920} height={1080}>
        ${blockEls}
      </svg>
    </AbsoluteFill>
  );
};
`;
    }
    case 'ui': {
      // App UI mockup: browser window with content
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slide = spring({ frame, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ backgroundColor: '#1a1a2e', justifyContent:'center', alignItems:'center', fontFamily:'system-ui' }}>
      <div style={{ width:1200, height:720, background:'#16213e', borderRadius:16, overflow:'hidden',
        transform:\`translateY(\${interpolate(slide,[0,1],[80,0])})\`, opacity:slide }}>
        <div style={{ height:50, background:'#0f3460', display:'flex', alignItems:'center', padding:'0 20' }}>
          {['red','#f0a500','#6dd5a0'].map((c,i)=> <div key={i} style={{ width:16, height:16, borderRadius:'50%', background:c, marginRight:10 }} />)}
        </div>
        <div style={{ padding:60 }}>
          <span style={{ color:'white', fontSize:48, fontWeight:700 }}>${title}</span>
          <div style={{ display:'flex', gap:20, marginTop:40 }}>
            ${(spec.data ?? [1,2,3]).map((_, i) =>
              `<div key={${i}} style={{ flex:1, height:200, background:\`\${A}33\`, borderRadius:12, padding:20 }}>
                <div style={{ width:'60%', height:20, background:A, borderRadius:6, marginBottom:16, opacity:0.6 }} />
                <div style={{ width:'90%', height:20, background:B, borderRadius:6, opacity:0.4 }} />
              </div>`
            ).join('\\n            ')}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
`;
    }
    case 'map': {
      // Animated route/path: moving dot along a polyline
      const points = (spec.data ?? [0, 1, 2, 3, 4, 5, 4, 3, 2, 1]).map((v, i) => ({
        x: 200 + (i / 9) * 1520,
        y: 300 + (i % 2 === 0 ? -v * 40 : v * 40),
      }));
      const polyline = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = Math.min(frame / 60, 1);
  const pos = (() => {
    const pts = [${points.map(p => `{x:${Math.round(p.x)},y:${Math.round(p.y)}}`).join(',')}];
    const total = pts.length - 1;
    const seg = Math.min(Math.floor(t * total), total - 1);
    const f = (t * total) - seg;
    return { x: pts[seg].x + (pts[seg + 1].x - pts[seg].x) * f, y: pts[seg].y + (pts[seg + 1].y - pts[seg].y) * f };
  })();
  return (
    <AbsoluteFill style={{ backgroundColor: '#0d1117', fontFamily: 'system-ui' }}>
      <svg width={1920} height={1080}>
        <path d="${polyline}" fill="none" stroke="#30363d" strokeWidth={4} strokeLinecap="round" />
        <path d="${polyline}" fill="none" stroke={B} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={2000} strokeDashoffset={interpolate(t, [0,1], [2000,0])} />
        <circle cx={pos.x} cy={pos.y} r={16} fill={A} />
        <circle cx={pos.x} cy={pos.y} r={24} fill={\`\${A}44\`} />
      </svg>
      <span style={{ position:'absolute', bottom:60, left:90, color:'white', fontSize:36 }}>${title}</span>
    </AbsoluteFill>
  );
};
`;
    }
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
        .join('\\n      ');
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
    case 'particle': {
      // Varied particle system: different seed per variant, multi-color, multi-size
      const pCount = 150;
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const parts = Array.from({ length: ${pCount} }, (_, i) => {
    const seed = i * 7.3 + ${vOff};
    const x = (seed * 137.5 + i * 3.1) % 1920;
    const speed = 1 + (i % 5) * 0.7;
    const y = (frame * speed + seed * 53 + ${vOff} * 2) % 1280 - 100;
    const size = 4 + (i % 6);
    const hue = (i * 27 + ${Math.round(vOff)}) % 360;
    const wobble = Math.sin(frame * 0.05 + i * 0.7) * 60;
    return <div key={i} style={{ position:'absolute', left:x + wobble, top:y, width:size, height:size,
      background:\`hsl(\${hue},80%,60%)\`, borderRadius: Math.round(size/2) === size/2 ? '50%' : 3, opacity:0.85 }} />;
  });
  return <AbsoluteFill style={{ backgroundColor: BG }}>{parts}</AbsoluteFill>;
};
`;
    }
    case 'procedural': {
      // Geometric procedural art: rotating shapes, changing colors, grid patterns
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame * 0.02;
  return (
    <AbsoluteFill style={{ backgroundColor: BG, justifyContent:'center', alignItems:'center' }}>
      <svg width={960} height={960} viewBox="0 0 960 960">
        {Array.from({ length: 12 }, (_, i) => i).map(i => (
          <rect key={i}
            x={480 - (300 + i * 40) * Math.cos(t + i * 0.8 * Math.PI / 6)}
            y={480 - (300 + i * 40) * Math.sin(t + i * 0.8 * Math.PI / 6)}
            width={60 + i * 8} height={60 + i * 8}
            fill="none"
            stroke={i % 2 === 0 ? A : B}
            strokeWidth={3}
            transform={\`rotate(\${frame * 2 + i * 30} \${480} \${480})\`}
            opacity={0.3 + (i / 12) * 0.5}
          />
        ))}
      </svg>
      <span style={{ position:'absolute', bottom:80, fontFamily:'system-ui', fontSize:40, color:'white', letterSpacing:4, opacity:0.7 }}>${title}</span>
    </AbsoluteFill>
  );
};
`;
    }
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
    case 'spectrum': {
      // Improved spectrum: more varied, with a reactive-looking pattern
      return `${head}
export const Scene${spec.index}: React.FC = () => {
  const frame = useCurrentFrame();
  const base = frame * 0.08 + ${vOff * 0.01};
  const bars = Array.from({ length: 64 }, (_, i) => {
    const osc = Math.sin(base * 2 + i * 0.15) * 0.4
            + Math.sin(base * 3.7 + i * 0.09) * 0.3
            + Math.sin(base * 5.1 + i * 0.22) * 0.3;
    const h = 30 + Math.max(0, osc) * 520;
    const hue = (i * 5.625 + frame * 0.5) % 360;
    return <div key={i} style={{ width:18, height:h, background:\`hsl(\${hue},80%,60%)\`, borderRadius:6,
      transition: 'height 0.05s' }} />;
  });
  return (
    <AbsoluteFill style={{ backgroundColor: BG, justifyContent:'center', alignItems:'center' }}>
      <div style={{ display:'flex', gap:8, alignItems:'flex-end', height:560 }}>{bars}</div>
    </AbsoluteFill>
  );
};
`;
    }
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
