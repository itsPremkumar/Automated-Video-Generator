import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { THEME, seeded } from '../lib/theme';

const COLORS = [THEME.accent, THEME.accent2, THEME.accent3, '#34d399', '#fbbf24', '#f87171'];
const COUNT = 140;

export const ConfettiParticles: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg }}>
      {/* celebratory headline */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <span
          style={{
            fontFamily: THEME.font,
            fontWeight: 900,
            fontSize: 130,
            color: THEME.text,
            textShadow: `0 0 60px ${THEME.accent}`,
          }}
        >
          🎉 Launch!
        </span>
      </AbsoluteFill>

      {Array.from({ length: COUNT }).map((_, i) => {
        const startX = seeded(i) * width;
        const drift = (seeded(i + 100) - 0.5) * 300;
        const speed = 2 + seeded(i + 200) * 4;
        const size = 8 + seeded(i + 300) * 18;
        const rot = frame * (2 + seeded(i + 400) * 6);
        const y = ((frame * speed + seeded(i + 500) * height) % (height + 100)) - 50;
        const x = startX + Math.sin(frame * 0.05 + i) * 40 + (drift * frame) / height;
        const color = COLORS[i % COLORS.length];
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: size,
              height: size * 0.6,
              backgroundColor: color,
              borderRadius: 2,
              transform: `rotate(${rot}deg)`,
              opacity: 0.9,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
