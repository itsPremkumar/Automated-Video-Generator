import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { THEME } from '../lib/theme';

const WORDS = ['Code', 'Becomes', 'Motion', 'With', 'Remotion'];

export const KineticTypography: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, justifyContent: 'center', alignItems: 'center' }}>
      {/* subtle animated gradient glow behind */}
      <div
        style={{
          position: 'absolute',
          width: width * 0.9,
          height: height * 0.5,
          borderRadius: '50%',
          filter: 'blur(120px)',
          opacity: 0.35,
          background: `radial-gradient(circle, ${THEME.accent} 0%, ${THEME.accent2} 60%, transparent 80%)`,
          transform: `rotate(${frame * 0.4}deg)`,
        }}
      />
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '0 28px',
          maxWidth: '85%',
        }}
      >
        {WORDS.map((word, i) => {
          const delay = i * 8;
          const enter = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 120 } });
          const y = interpolate(enter, [0, 1], [80, 0]);
          const isAccent = i === WORDS.length - 1;
          return (
            <span
              key={i}
              style={{
                fontFamily: THEME.font,
                fontWeight: 800,
                fontSize: 120,
                lineHeight: 1.1,
                opacity: enter,
                transform: `translateY(${y}px) scale(${interpolate(enter, [0, 1], [0.6, 1])})`,
                color: isAccent ? 'transparent' : THEME.text,
                backgroundImage: isAccent
                  ? `linear-gradient(90deg, ${THEME.accent2}, ${THEME.accent3})`
                  : undefined,
                backgroundClip: isAccent ? 'text' : undefined,
                WebkitBackgroundClip: isAccent ? 'text' : undefined,
                textShadow: isAccent ? `0 0 40px ${THEME.accent3}88` : undefined,
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
