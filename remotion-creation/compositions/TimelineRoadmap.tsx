import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { THEME, seeded } from '../lib/theme';

const STEPS = [
  { t: 'Q1', label: 'Research', c: THEME.accent },
  { t: 'Q2', label: 'Prototype', c: THEME.accent2 },
  { t: 'Q3', label: 'Launch', c: THEME.accent3 },
  { t: 'Q4', label: 'Scale', c: '#34d399' },
];

export const TimelineRoadmap: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const y = 540;
  const x0 = 240;
  const x1 = width - 240;
  const progress = spring({ frame: frame - 8, fps, config: { damping: 18, stiffness: 70 } });

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, fontFamily: THEME.font }}>
      <h1 style={{ position: 'absolute', top: 80, left: 90, color: THEME.text, fontSize: 62, fontWeight: 800, margin: 0 }}>
        Product Roadmap
      </h1>
      <svg width={width} height={1080} style={{ position: 'absolute' }}>
        <line x1={x0} y1={y} x2={x1} y2={y} stroke={`${THEME.muted}55`} strokeWidth={8} />
        <line
          x1={x0}
          y1={y}
          x2={interpolate(progress, [0, 1], [x0, x1])}
          y2={y}
          stroke={`url(#grad)`}
          strokeWidth={8}
        />
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={THEME.accent} />
            <stop offset="100%" stopColor={THEME.accent3} />
          </linearGradient>
        </defs>
        {STEPS.map((s, i) => {
          const cx = x0 + ((x1 - x0) * i) / (STEPS.length - 1);
          const pop = spring({ frame: frame - 12 - i * 8, fps, config: { damping: 14, stiffness: 120 } });
          const lit = progress >= i / (STEPS.length - 1);
          return (
            <g key={i}>
              <circle cx={cx} cy={y} r={34 * pop} fill={s.c} opacity={lit ? 1 : 0.35} style={{ filter: `drop-shadow(0 0 18px ${s.c})` }} />
              <text x={cx} y={y - 70} fill={THEME.text} fontSize={44} fontWeight={800} textAnchor="middle" opacity={pop}>
                {s.t}
              </text>
              <text x={cx} y={y + 90} fill={THEME.muted} fontSize={38} textAnchor="middle" opacity={pop}>
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
