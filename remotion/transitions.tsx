/**
 * transitions.tsx — richer scene transitions built on @remotion/transitions.
 *
 * Remotion 4.x API notes (verified against installed 4.0.487 d.ts):
 *  - Transitions live BETWEEN two <TransitionSeries.Sequence> via a
 *    <TransitionSeries.Transition presentation={...} timing={...} /> element.
 *  - A custom presentation is { component, props }. The component receives
 *    `presentationProgress` (0→1) in its own props — do NOT call
 *    useTransitionProgress() (that returns {entering,exiting,isInTransitionSeries}
 *    and is for a different use).
 *  - timing (linearTiming/springTiming) is passed on the <Transition> element.
 *
 * Patterns re-implemented (MIT study: remotion-scenes TransitionCircleWipe,
 * remotion-animated): circle wipe (clip-path), slide (translateX), flip (rotateY),
 * fade (opacity). Custom = our own code, license-clean + version-robust.
 */
import React from 'react';
import {
    AbsoluteFill,
    Img,
    Video,
    staticFile,
    useVideoConfig,
    interpolate,
} from 'remotion';
import {
    TransitionSeries,
    linearTiming,
    springTiming,
    type TransitionPresentation,
    type TransitionPresentationComponentProps,
    type TransitionTiming,
} from '@remotion/transitions';

export type RichTransitionKind = 'fade' | 'slide' | 'circleWipe' | 'flip';

/* ------------------------------------------------------------------ */
/* Custom presentations (each renders the incoming scene over progress) */
/* ------------------------------------------------------------------ */

const FadePresentation: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({ presentationProgress, children }) => (
    <AbsoluteFill style={{ opacity: presentationProgress }}>{children}</AbsoluteFill>
);

const SlidePresentation: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({ presentationProgress, children }) => {
    const { width } = useVideoConfig();
    return (
        <AbsoluteFill style={{ transform: `translateX(${interpolate(presentationProgress, [0, 1], [width, 0])}px)` }}>
            {children}
        </AbsoluteFill>
    );
};

const FlipPresentation: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({ presentationProgress, children }) => (
    <AbsoluteFill
        style={{
            perspective: 1000,
            transform: `rotateY(${interpolate(presentationProgress, [0, 1], [90, 0])}deg)`,
            transformStyle: 'preserve-3d',
            backfaceVisibility: 'hidden',
        }}
    >
        {children}
    </AbsoluteFill>
);

const CircleWipePresentation: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({ presentationProgress, children }) => {
    const pct = interpolate(presentationProgress, [0, 1], [0, 150], { extrapolateRight: 'clamp' });
    return (
        <AbsoluteFill style={{ clipPath: `circle(${pct}% at 50% 50%)`, WebkitClipPath: `circle(${pct}% at 50% 50%)` }}>
            {children}
        </AbsoluteFill>
    );
};

function compFor(kind: RichTransitionKind): React.FC<TransitionPresentationComponentProps<Record<string, never>>> {
    switch (kind) {
        case 'slide':
            return SlidePresentation;
        case 'circleWipe':
            return CircleWipePresentation;
        case 'flip':
            return FlipPresentation;
        case 'fade':
        default:
            return FadePresentation;
    }
}

export function presentationFor(kind: RichTransitionKind): TransitionPresentation<Record<string, never>> {
    return { component: compFor(kind), props: {} };
}

export function timingFor(kind: RichTransitionKind, springy = false): TransitionTiming {
    return springy ? springTiming({ config: { damping: 200 }, durationInFrames: 30 }) : linearTiming({ durationInFrames: 24 });
}

/* ------------------------------------------------------------------ */
/* Shared scene visual (kept local to avoid import cycles with AgenticVideo) */
/* ------------------------------------------------------------------ */

export const TransitionSceneVisual: React.FC<{ src: string; grade?: string }> = ({ src, grade }) => {
    const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(src);
    return (
        <AbsoluteFill style={{ backgroundColor: '#000' }}>
            {isVideo ? (
                <Video src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: grade }} />
            ) : (
                <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: grade }} />
            )}
            <AbsoluteFill
                style={{
                    background:
                        'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 40%), radial-gradient(circle, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)',
                }}
            />
        </AbsoluteFill>
    );
};

/* ------------------------------------------------------------------ */
/* Public: render scenes with rich transitions via TransitionSeries.    */
/* First scene has no entering transition; each subsequent scene is      */
/* preceded by a <Transition> using the PREVIOUS scene's transition kind.*/
/* ------------------------------------------------------------------ */
export const AgenticTransitionSeries: React.FC<{
    scenes: { src: string; grade?: string; durationInFrames: number; transition: RichTransitionKind }[];
}> = ({ scenes }) => {
    return (
        <TransitionSeries>
            {scenes.map((s, i) => (
                <React.Fragment key={i}>
                    {i > 0 && (
                        <TransitionSeries.Transition presentation={presentationFor(s.transition)} timing={timingFor(s.transition)} />
                    )}
                    <TransitionSeries.Sequence durationInFrames={s.durationInFrames}>
                        <TransitionSceneVisual src={s.src} grade={s.grade} />
                    </TransitionSeries.Sequence>
                </React.Fragment>
            ))}
        </TransitionSeries>
    );
};

/** Unit-testable helper. */
export function secondsToFrames(seconds: number, fps: number): number {
    return Math.max(1, Math.round(seconds * fps));
}
