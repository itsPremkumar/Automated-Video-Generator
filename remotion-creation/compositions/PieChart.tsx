import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { THEME } from '../lib/theme';

const DEFAULT = [
  { label: 'Mobile', value: 48, color: THEME.accent },
  { label: 'Desktop', value: 32, color: THEME.accent2 },
  { label: 'Tablet', value: 12, color: THEME.accent3 },
  { label: 'Other', value: 8, color: '#34d399' },
];

export const PieChart: React.FC<{ data?: typeof DEFAULT; title?: string }> = ({
  data = DEFAULT,
  title = 'Traffic by Device',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const total = data.reduce((s, d) => s + d.value, 0);
  const grow = spring({ frame, fps, config: { damping: 18, stiffness: 80 } });
  const sweep = interpolate(grow, [0, 1], [0, Math.PI * 2]);

  let angle = -Math.PI / 2;
  const R = 320;
  const cx = 1920 / 2 - 260;
  const cy = 1080 / 2;

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, fontFamily: THEME.font }}>
      <h1 style={{ color: THEME.text, fontSize: 64, fontWeight: 800, position: 'absolute', top: 70, left: 90, margin: 0 }}>
        {title}
      </h1>
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        {data.map((d, i) => {
          const frac = d.value / total;
          const a0 = angle;
          const a1 = angle + frac * Math.PI * 2 * grow;
          angle += frac * Math.PI * 2 * grow;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const x0 = cx + R * Math.cos(a0);
          const y0 = cy + R * Math.sin(a0);
          const x1 = cx + R * Math.cos(a1);
          const y1 = cy + R * Math.sin(a1);
          const x0i = cx + (R - 0) * Math.cos(a0);
          const y0i = cy + (R - 0) * Math.sin(a0);
          const x1i = cx + (R - 0) * Math.cos(a1);
          const y1i = cy + (R - 0) * Math.sin(a1);
          const path = `M ${cx} ${cy} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`;
          return <path key={i} d={path} fill={d.color} stroke={THEME.bg} strokeWidth={3} />;
        })}
      </svg>
      {/* legend + count-up */}
      <div style={{ position: 'absolute', right: 140, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 26 }}>
        {data.map((d, i) => {
          const c = Math.round(interpolate(grow, [0, 1], [0, d.value]));
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: d.color }} />
              <span style={{ color: THEME.text, fontSize: 40, fontWeight: 700, minWidth: 70 }}>{c}%</span>
              <span style={{ color: THEME.muted, fontSize: 36 }}>{d.label}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
