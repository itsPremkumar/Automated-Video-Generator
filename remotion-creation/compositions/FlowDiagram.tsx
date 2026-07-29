import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

/**
 * FlowDiagram — animated block/flow explanation diagram.
 * Props: title, steps (array of step names), colors.
 */
export const FlowDiagram: React.FC<{
  title?: string;
  steps?: string[];
  accentColor?: string;
  accentColorB?: string;
}> = ({ title = 'How It Works', steps = ['Input', 'Process', 'Output'], accentColor = '#7c3aed', accentColorB = '#22d3ee' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a14', fontFamily: 'system-ui', padding: 60 }}>
      <h1 style={{ color: '#fff', fontSize: 52, fontWeight: 800, marginBottom: 80 }}>{title}</h1>
      <svg width={1800} height={800} style={{ marginTop: 40 }}>
        {steps.map((step, i) => {
          const cx = 200 + (i / Math.max(steps.length - 1, 1)) * 1400;
          const y = 400;
          const opacity = spring({ frame: frame - i * 10, fps, config: { damping: 14 } });
          return (
            <g key={i}>
              {/* Arrow connector (except last) */}
              {i < steps.length - 1 && (
                <line x1={cx + 80} y1={y} x2={cx + 240} y2={y}
                  stroke="#333" strokeWidth={3} strokeDasharray="8 4" />
              )}
              {/* Block */}
              <rect x={cx - 80} y={y - 80} width={160} height={160} rx={20}
                fill={i % 2 === 0 ? accentColor : accentColorB}
                opacity={interpolate(opacity, [0, 1], [0, 0.9])}
                transform={`scale(${interpolate(opacity, [0, 1], [0.5, 1])})`}
                style={{ transformOrigin: `${cx}px ${y}px` }}
              />
              <text x={cx} y={y + 8} fill="white" fontSize={36} fontWeight={700}
                textAnchor="middle" dominantBaseline="middle"
                opacity={opacity}>{step}</text>
              {/* Step number */}
              <circle cx={cx} cy={y - 120} r={22} fill={accentColor} opacity={opacity} />
              <text x={cx} y={y - 115} fill="white" fontSize={24} fontWeight={700}
                textAnchor="middle" opacity={opacity}>{i + 1}</text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
