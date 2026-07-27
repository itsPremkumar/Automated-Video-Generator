import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { THEME } from '../lib/theme';

// Seamless loop: blobs orbit on sine paths whose period divides the duration.
export const AuroraLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const t = (frame / durationInFrames) * Math.PI * 2; // one full cycle => seamless

  const blobs = [
    { c: THEME.accent, r: 700, ox: 0.3, oy: 0.3, sx: 1, sy: 1 },
    { c: THEME.accent2, r: 620, ox: 0.7, oy: 0.4, sx: -1, sy: 1 },
    { c: THEME.accent3, r: 560, ox: 0.5, oy: 0.7, sx: 1, sy: -1 },
    { c: '#3b82f6', r: 640, ox: 0.4, oy: 0.6, sx: -1, sy: -1 },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, overflow: 'hidden' }}>
      {blobs.map((b, i) => {
        const x = width * b.ox + Math.cos(t * b.sx + i) * 220 - b.r / 2;
        const y = height * b.oy + Math.sin(t * b.sy + i) * 200 - b.r / 2;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: b.r,
              height: b.r,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${b.c} 0%, transparent 70%)`,
              filter: 'blur(90px)',
              opacity: 0.55,
              mixBlendMode: 'screen',
            }}
          />
        );
      })}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ fontFamily: THEME.font, fontWeight: 300, fontSize: 90, color: THEME.text, letterSpacing: 8, opacity: 0.9 }}>
          A U R O R A
        </span>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
