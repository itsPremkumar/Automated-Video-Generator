/**
 * kinetic-text.tsx — per-character spring title (TextKinetic pattern from
 * remotion-scenes, MIT, re-implemented). Each character springs in with a
 * staggered delay + subtle bounce/rotate. Used for intro/outro titles and
 * hook text. License-clean (our code, study pattern).
 *
 * Layout note: the outer node is a centering AbsoluteFill; characters live in
 * an INNER row that is width-constrained (max 90%) and wraps, so the title
 * stays a centered block instead of stretching edge-to-edge across the frame.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring } from 'remotion';

export const KineticText: React.FC<{
    text: string;
    fontSize?: number;
    color?: string;
    delay?: number;
    perCharMs?: number;
    style?: React.CSSProperties;
}> = ({ text, fontSize = 80, color = '#fff', delay = 0, perCharMs = 45, style }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const chars = Array.from(text);
    return (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', ...style }}>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    alignItems: 'center',
                    maxWidth: '90%',
                    rowGap: fontSize * 0.1,
                }}
            >
                {chars.map((char, i) => {
                    const d = Math.round((delay + (i * perCharMs) / 1000) * fps);
                    const p = spring({ frame: frame - d, fps, config: { damping: 12, stiffness: 200, mass: 0.8 } });
                    const bounce = Math.sin((frame - d) * 0.15) * 5 * p;
                    const rotate = Math.sin((frame - d) * 0.1 + i) * 3 * p;
                    if (char === ' ')
                        return (
                            <span key={i} style={{ width: fontSize * 0.35, display: 'inline-block' }} />
                        );
                    return (
                        <span
                            key={i}
                            style={{
                                display: 'inline-block',
                                fontSize,
                                fontWeight: 900,
                                color,
                                transform: `translateY(${(1 - p) * 40 + bounce}px) rotate(${rotate}deg) scale(${0.6 + 0.4 * p})`,
                                opacity: p,
                                textShadow: '0 4px 18px rgba(0,0,0,0.6)',
                            }}
                        >
                            {char}
                        </span>
                    );
                })}
            </div>
        </AbsoluteFill>
    );
};
