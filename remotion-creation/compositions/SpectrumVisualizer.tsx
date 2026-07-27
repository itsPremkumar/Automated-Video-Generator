import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { THEME, seeded } from '../lib/theme';

const CX = 960;
const CY = 540;
const INNER = 180;
const BARS = 96;

export const SpectrumVisualizer: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, justifyContent: 'center', alignItems: 'center' }}>
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        {Array.from({ length: BARS }).map((_, i) => {
          const ang = (i / BARS) * Math.PI * 2;
          // procedural "spectrum": layered sines + per-bar seed => lively motion
          const amp =
            0.5 +
            0.5 *
              Math.abs(
                Math.sin(frame * 0.08 + i * 0.35) * 0.6 +
                  Math.sin(frame * 0.05 + seeded(i) * 10) * 0.4,
              );
          const len = INNER + amp * 260;
          const x1 = CX + Math.cos(ang) * INNER;
          const y1 = CY + Math.sin(ang) * INNER;
          const x2 = CX + Math.cos(ang) * len;
          const y2 = CY + Math.sin(ang) * len;
          const hue = (i / BARS) * 360 + frame;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={`hsl(${hue % 360}, 90%, 62%)`}
              strokeWidth={7}
              strokeLinecap="round"
            />
          );
        })}
        <circle cx={CX} cy={CY} r={INNER - 14} fill="none" stroke={`${THEME.text}33`} strokeWidth={2} />
      </svg>
      <span style={{ position: 'absolute', fontFamily: THEME.font, fontWeight: 700, fontSize: 46, color: THEME.text }}>
        ♫ NOW PLAYING
      </span>
    </AbsoluteFill>
  );
};
