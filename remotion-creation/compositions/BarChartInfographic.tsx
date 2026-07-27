import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { THEME } from '../lib/theme';

const DATA = [
  { label: 'Jan', value: 42, color: THEME.accent },
  { label: 'Feb', value: 68, color: THEME.accent2 },
  { label: 'Mar', value: 55, color: THEME.accent3 },
  { label: 'Apr', value: 91, color: '#34d399' },
  { label: 'May', value: 76, color: '#fbbf24' },
];

export const BarChartInfographic: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const maxVal = Math.max(...DATA.map((d) => d.value));
  const chartH = 620;

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, padding: 80, fontFamily: THEME.font }}>
      <h1 style={{ color: THEME.text, fontSize: 64, fontWeight: 800, margin: 0 }}>
        Monthly Growth
      </h1>
      <p style={{ color: THEME.muted, fontSize: 30, marginTop: 8 }}>Users acquired (thousands)</p>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-around',
          height: chartH,
          marginTop: 60,
          borderBottom: `3px solid ${THEME.muted}44`,
        }}
      >
        {DATA.map((d, i) => {
          const delay = 10 + i * 6;
          const grow = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 90 } });
          const barH = (d.value / maxVal) * (chartH - 80) * grow;
          const count = Math.round(interpolate(grow, [0, 1], [0, d.value]));
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 180 }}>
              <span style={{ color: THEME.text, fontSize: 40, fontWeight: 700, marginBottom: 12, opacity: grow }}>
                {count}
              </span>
              <div
                style={{
                  width: 130,
                  height: barH,
                  borderRadius: '14px 14px 0 0',
                  background: `linear-gradient(180deg, ${d.color}, ${d.color}88)`,
                  boxShadow: `0 0 40px ${d.color}66`,
                }}
              />
              <span style={{ color: THEME.muted, fontSize: 34, marginTop: 16 }}>{d.label}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
