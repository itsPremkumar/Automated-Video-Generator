import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { THEME, seeded } from '../lib/theme';

// Layer sizes for a small feed-forward net.
const LAYERS = [4, 6, 6, 3];
const W = 1920;
const H = 1080;
const MARGIN_X = 320;
const MARGIN_Y = 160;

type Node = { x: number; y: number; layer: number; idx: number };

function buildNodes(): Node[] {
  const nodes: Node[] = [];
  const gapX = (W - MARGIN_X * 2) / (LAYERS.length - 1);
  LAYERS.forEach((count, layer) => {
    const gapY = (H - MARGIN_Y * 2) / (count - 1 || 1);
    for (let i = 0; i < count; i++) {
      nodes.push({
        x: MARGIN_X + layer * gapX,
        y: count === 1 ? H / 2 : MARGIN_Y + i * gapY,
        layer,
        idx: i,
      });
    }
  });
  return nodes;
}

export const NeuralNetwork: React.FC = () => {
  const frame = useCurrentFrame();
  const nodes = buildNodes();

  // edges between consecutive layers
  const edges: { a: Node; b: Node; k: number }[] = [];
  let k = 0;
  for (let l = 0; l < LAYERS.length - 1; l++) {
    const from = nodes.filter((n) => n.layer === l);
    const to = nodes.filter((n) => n.layer === l + 1);
    from.forEach((a) => to.forEach((b) => edges.push({ a, b, k: k++ })));
  }

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg }}>
      <svg width={W} height={H} style={{ position: 'absolute' }}>
        {edges.map(({ a, b, k }) => {
          // a signal pulse travels along the edge, phase offset per edge
          const phase = (frame * 0.02 + seeded(k)) % 1;
          const px = interpolate(phase, [0, 1], [a.x, b.x]);
          const py = interpolate(phase, [0, 1], [a.y, b.y]);
          return (
            <g key={k}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={`${THEME.accent}33`} strokeWidth={1.5} />
              <circle cx={px} cy={py} r={4} fill={THEME.accent2} opacity={0.9} />
            </g>
          );
        })}
        {nodes.map((n, i) => {
          const pulse = 1 + 0.15 * Math.sin(frame * 0.1 + i);
          return (
            <circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={22 * pulse}
              fill={THEME.bg2}
              stroke={n.layer === 0 ? THEME.accent2 : n.layer === LAYERS.length - 1 ? THEME.accent3 : THEME.accent}
              strokeWidth={4}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          bottom: 60,
          width: '100%',
          textAlign: 'center',
          fontFamily: THEME.font,
          color: THEME.text,
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: 2,
        }}
      >
        Neural Network · Forward Pass
      </div>
    </AbsoluteFill>
  );
};
