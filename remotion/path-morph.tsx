/**
 * path-morph.tsx — SVG path morph transition via @remotion/paths
 * interpolatePath(from, to). Renders a full-frame shape that morphs
 * (e.g. circle -> star) as a wipe/reveal between scenes. Re-implemented,
 * license-clean. Used as an optional rich transition alongside the
 * @remotion/transitions presentations in transitions.tsx.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { interpolatePath } from '@remotion/paths';

const CIRCLE = 'M 50 0 C 77 0 100 23 100 50 C 100 77 77 100 50 100 C 23 100 0 77 0 50 C 0 23 23 0 50 0 Z';
const STAR = 'M 50 5 L 61 38 L 95 38 L 67 59 L 78 92 L 50 71 L 22 92 L 33 59 L 5 38 L 39 38 Z';
const BLOB = 'M 20 50 C 20 20 50 10 75 25 C 100 40 95 75 70 88 C 45 100 20 80 20 50 Z';

export type MorphShape = 'circle' | 'star' | 'blob';

const pathFor = (s: MorphShape): string => (s === 'star' ? STAR : s === 'blob' ? BLOB : CIRCLE);

export const PathMorphReveal: React.FC<{
    from?: MorphShape;
    to?: MorphShape;
    color?: string;
    /** progress 0..1 driven by parent (or internal if standalone) */
    progress?: number;
}> = ({ from = 'circle', to = 'star', color = '#FF6B35', progress: ext }) => {
    const frame = useCurrentFrame();
    const p = ext ?? interpolate(frame, [0, 24], [0, 1], { extrapolateRight: 'clamp' });
    const d = interpolatePath(p, pathFor(from), pathFor(to));
    return (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
            <svg viewBox="0 0 100 100" width="140%" height="140%">
                <path d={d} fill={color} opacity={0.85} />
            </svg>
        </AbsoluteFill>
    );
};
