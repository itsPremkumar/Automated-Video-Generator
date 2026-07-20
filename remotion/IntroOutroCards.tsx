/**
 * IntroOutroCards.tsx — gradient intro/outro cards powered by @remotion/shapes
 * (decorative Circle/Rect accents) + spring() entrances. Replaces the inline
 * gradient cards in AgenticVideo.tsx, adding a spring-driven reveal and a
 * brand-colored shape accent (learned from remotion-scenes ShapeAnimations).
 *
 * Uses ONLY installed packages. No new deps, license-clean.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Easing, spring, useVideoConfig } from 'remotion';
import { Circle, Rect } from '@remotion/shapes';
import type { IntroCard, OutroCard } from './AgenticVideo';

function GradientBackdrop({ from, to }: { from: string; to: string }) {
    return (
        <AbsoluteFill
            style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
        />
    );
}

export const IntroSceneCard: React.FC<{ card: IntroCard; accent: string; primary?: string; hideTitle?: boolean }> = ({
    card,
    accent,
    primary = '#004E89',
    hideTitle = false,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const enter = spring({ frame, fps, config: { damping: 200, stiffness: 120 } });
    const titleOpacity = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    const subOpacity = interpolate(frame, [20, 35], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    return (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
            <GradientBackdrop from={primary} to={accent} />
            {/* decorative accent ring (spring-scaled) — hidden when kinetic title replaces it */}
            {!hideTitle && (
                <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: 0.5 * enter }}>
                    <Circle radius={Math.round(110 * enter)} color="rgba(255,255,255,0.18)" strokeWidth={6} />
                </AbsoluteFill>
            )}
            {!hideTitle && (
                <div style={{ opacity: titleOpacity * enter, color: '#fff', fontSize: 72, fontWeight: 800, textAlign: 'center', padding: 40, transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px)` }}>
                    {card.title}
                </div>
            )}
            {card.subtitle && (
                <div style={{ opacity: subOpacity, color: '#fff', fontSize: 40, marginTop: hideTitle ? 160 : 20, textAlign: 'center', padding: 20 }}>
                    {card.subtitle}
                </div>
            )}
        </AbsoluteFill>
    );
};

export const OutroSceneCard: React.FC<{ card: OutroCard; accent: string; primary?: string; hideTitle?: boolean }> = ({
    card,
    accent,
    primary = '#1A1A2E',
    hideTitle = false,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const enter = spring({ frame, fps, config: { damping: 200, stiffness: 120 } });
    const ctaOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    return (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
            <GradientBackdrop from={primary} to="#004E89" />
            {/* decorative accent bar */}
            <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: 0.4 * enter }}>
                <Rect width={Math.round(360 * enter)} height={10} color={accent} radius={5} />
            </AbsoluteFill>
            {!hideTitle && (
                <div style={{ opacity: ctaOpacity, color: '#fff', fontSize: 56, fontWeight: 800, textAlign: 'center', padding: 40 }}>
                    {card.ctaText}
                </div>
            )}
            {card.showSubscribe && (
                <div style={{ opacity: ctaOpacity, color: '#fff', fontSize: 32, marginTop: 24, padding: '12px 28px', border: `2px solid ${accent}`, borderRadius: 40 }}>
                    Subscribe
                </div>
            )}
            {card.hashtags && (
                <div style={{ opacity: ctaOpacity, color: '#FFB38A', fontSize: 28, marginTop: 24, textAlign: 'center' }}>
                    {card.hashtags.join(' ')}
                </div>
            )}
        </AbsoluteFill>
    );
};
