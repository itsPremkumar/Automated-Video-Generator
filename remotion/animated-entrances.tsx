/**
 * animated-entrances.tsx — reusable entrance animations (animate.css-style:
 * bounceIn / fadeInUp / zoomIn) as a <Animated> wrapper. Pattern from
 * remotion-animation (MIT), re-implemented. Wraps any children and applies a
 * spring/opacity entrance over `durationInFrames`. License-clean.
 */
import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate, Easing } from 'remotion';

export type EntranceKind = 'bounceIn' | 'fadeInUp' | 'zoomIn' | 'fadeIn';

export const Animated: React.FC<{
    kind?: EntranceKind;
    children: React.ReactNode;
    delayFrames?: number;
    durationInFrames?: number;
    style?: React.CSSProperties;
}> = ({ kind = 'fadeInUp', children, delayFrames = 0, durationInFrames = 20, style }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const local = frame - delayFrames;
    const p = spring({ frame: local, fps, config: { damping: 14, stiffness: 120, mass: 0.8 } });
    const op = interpolate(local, [0, Math.min(8, durationInFrames)], [0, 1], { extrapolateRight: 'clamp' });

    let transform = '';
    switch (kind) {
        case 'bounceIn':
            transform = `scale(${0.3 + 0.7 * p})`;
            break;
        case 'zoomIn':
            transform = `scale(${0.5 + 0.5 * p})`;
            break;
        case 'fadeInUp':
            transform = `translateY(${(1 - p) * 60}px)`;
            break;
        case 'fadeIn':
        default:
            transform = 'none';
            break;
    }
    return (
        <div
            style={{
                opacity: Math.min(op, p),
                transform,
                transformOrigin: 'center',
                ...style,
            }}
        >
            {children}
        </div>
    );
};
