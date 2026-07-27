import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { THEME } from '../lib/theme';

export const LowerThird: React.FC<{ name?: string; role?: string; accent?: string }> = ({
  name = 'ram',
  role = 'developer',
  accent = THEME.accent2,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bar = spring({ frame: frame - 6, fps, config: { damping: 14, stiffness: 120 } });
  const slide = interpolate(bar, [0, 1], [-900, 0]);
  const textIn = spring({ frame: frame - 16, fps, config: { damping: 14 } });

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg }}>
      {/* faux video backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 70% 30%, #1b2a4a, #0a0a14)' }} />
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-start' }}>
        <div style={{ marginBottom: 140, marginLeft: 90 }}>
          <div
            style={{
              transform: `translateX(${slide}px)`,
              background: 'rgba(10,10,20,0.7)',
              borderLeft: `10px solid ${accent}`,
              padding: '26px 60px 26px 40px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span
              style={{
                fontFamily: THEME.font,
                fontWeight: 800,
                fontSize: 72,
                color: THEME.text,
                opacity: textIn,
                transform: `translateX(${interpolate(textIn, [0, 1], [-40, 0])}px)`,
              }}
            >
              {name}
            </span>
            <span
              style={{
                fontFamily: THEME.mono,
                fontSize: 36,
                color: accent,
                opacity: textIn,
                marginTop: 6,
              }}
            >
              {role}
            </span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
