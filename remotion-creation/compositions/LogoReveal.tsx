import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { THEME } from '../lib/theme';

export const LogoReveal: React.FC<{ brand?: string; tagline?: string }> = ({
  brand = 'NEXUS',
  tagline = 'build · animate · ship',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const ring = spring({ frame: frame - 5, fps, config: { damping: 14, stiffness: 100 } });
  const ringRot = interpolate(frame, [0, 120], [0, 360]);
  const letterIn = spring({ frame: frame - 25, fps, config: { damping: 12, stiffness: 110 } });
  const tagIn = spring({ frame: frame - 45, fps, config: { damping: 16 } });

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          width: 520,
          height: 520,
          borderRadius: '50%',
          border: `6px solid ${THEME.accent}`,
          borderTopColor: THEME.accent2,
          borderRightColor: THEME.accent3,
          transform: `rotate(${ringRot}deg) scale(${interpolate(ring, [0, 1], [0.2, 1])})`,
          opacity: ring,
          boxShadow: `0 0 80px ${THEME.accent}66`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 360,
          height: 360,
          borderRadius: '40px',
          background: `linear-gradient(135deg, ${THEME.accent}, ${THEME.accent3})`,
          transform: `scale(${interpolate(ring, [0, 1], [0, 1])}) rotate(${-ringRot * 0.3}deg)`,
          opacity: ring,
        }}
      />
      <span
        style={{
          position: 'relative',
          fontFamily: THEME.font,
          fontWeight: 900,
          fontSize: 110,
          letterSpacing: 12,
          color: THEME.text,
          opacity: letterIn,
          transform: `translateY(${interpolate(letterIn, [0, 1], [60, 0])}px)`,
          textShadow: `0 0 50px ${THEME.accent2}`,
        }}
      >
        {brand}
      </span>
      <span
        style={{
          position: 'absolute',
          bottom: 360,
          fontFamily: THEME.mono,
          fontSize: 30,
          color: THEME.accent2,
          opacity: tagIn,
          letterSpacing: 6,
        }}
      >
        {tagline}
      </span>
    </AbsoluteFill>
  );
};
