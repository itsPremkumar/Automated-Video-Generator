/**
 * shape-accents.tsx — decorative brand accents via @remotion/shapes path
 * generators (makeStar/makeCircle/makePolygon/makeArrow). We generate the SVG
 * `d` path with the library and render a plain <svg><path> so we control
 * position/size precisely (the shape components use a fixed viewBox that is
 * awkward to place). License-clean (Remotion shapes pkg).
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { makeStar, makeCircle, makePolygon, makeArrow } from '@remotion/shapes';

export type AccentKind = 'star' | 'circle' | 'polygon' | 'arrow';

const buildPath = (kind: AccentKind, size: number): string => {
    switch (kind) {
        case 'star':
            return makeStar({ points: 5, innerRadius: size * 0.38, outerRadius: size * 0.5, edgeRoundness: 0 }).path;
        case 'circle':
            return makeCircle({ radius: size * 0.5 }).path;
        case 'polygon':
            return makePolygon({ points: 6, radius: size * 0.5 }).path;
        case 'arrow':
            return makeArrow({}).path;
        default:
            return makeCircle({ radius: size * 0.5 }).path;
    }
};

export const ShapeAccent: React.FC<{
    kind?: AccentKind;
    color?: string;
    size?: number;
    /** position in % of frame */
    xPct?: number;
    yPct?: number;
    opacity?: number;
    spin?: boolean;
    stroke?: boolean;
}> = ({ kind = 'star', color = '#FF6B35', size = 120, xPct = 50, yPct = 50, opacity = 0.5, spin = false, stroke = false }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const enter = spring({ frame, fps, config: { damping: 200, stiffness: 120 } });
    const rot = spin ? interpolate(frame, [0, 120], [0, 360]) : 0;
    const d = buildPath(kind, size);
    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <svg
                viewBox={`0 0 ${size} ${size}`}
                width={size * enter}
                height={size * enter}
                style={{
                    position: 'absolute',
                    left: `${xPct}%`,
                    top: `${yPct}%`,
                    transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                    opacity: opacity * enter,
                }}
            >
                <path
                    d={d}
                    fill={stroke ? 'none' : color}
                    stroke={stroke ? color : 'none'}
                    strokeWidth={stroke ? size * 0.06 : 0}
                />
            </svg>
        </AbsoluteFill>
    );
};
