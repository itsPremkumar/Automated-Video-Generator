import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { THEME } from '../lib/theme';

export const LoadingSpinner: React.FC<{ label?: string }> = ({ label = 'LOADING' }) => {
  const frame = useCurrentFrame();
  const rot = (frame * 6) % 360;
  const arc = 40 + 30 * Math.sin(frame * 0.15);

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, justifyContent: 'center', alignItems: 'center' }}>
      <svg width={300} height={300} viewBox="0 0 100 100" style={{ transform: `rotate(${rot}deg)` }}>
        <circle cx={50} cy={50} r={40} fill="none" stroke={`${THEME.accent}22`} strokeWidth={8} />
        <circle
          cx={50}
          cy={50}
          r={40}
          fill="none"
          stroke={THEME.accent2}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${arc} 1000`}
          style={{ filter: `drop-shadow(0 0 6px ${THEME.accent2})` }}
        />
      </svg>
      <span style={{ marginTop: 40, fontFamily: THEME.mono, fontSize: 40, color: THEME.text, letterSpacing: 8 }}>
        {label}
        <span style={{ opacity: (frame % 30) < 15 ? 1 : 0 }}>_</span>
      </span>
    </AbsoluteFill>
  );
};
