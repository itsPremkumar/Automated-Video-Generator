import React from 'react';
import {
    AbsoluteFill,
    useCurrentFrame,
    interpolate,
    Easing,
    useVideoConfig,
} from 'remotion';

export interface TextConfig {
    color?: string;
    fontSize?: number;
    position?: 'top' | 'center' | 'bottom';
    animation?: 'fade' | 'slide' | 'zoom' | 'typewriter';
}

interface SubtitleOverlayProps {
    text: string;
    config?: TextConfig;
    durationInFrames: number;
    delayInFrames?: number;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
    text,
    config = {},
    durationInFrames,
    delayInFrames = 12,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    
    const {
        color = '#ffffff',
        fontSize = 52,
        position = 'bottom',
        animation = 'fade',
    } = config;

    // Animation constants
    const ANIM_DURATION = 15; // 0.5s at 30fps
    const outStart = durationInFrames - ANIM_DURATION;

    // Basic Fade logic
    const fadeIn = interpolate(
        frame,
        [delayInFrames, delayInFrames + ANIM_DURATION],
        [0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.quad) }
    );

    const fadeOut = interpolate(
        frame,
        [outStart, durationInFrames],
        [1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.in(Easing.quad) }
    );

    const opacity = Math.min(fadeIn, fadeOut);

    // Position logic
    const justifyMap = {
        top: 'flex-start',
        center: 'center',
        bottom: 'flex-end',
    };

    // Animation specific transforms
    let transform = 'none';
    
    if (animation === 'slide') {
        const slideIn = interpolate(fadeIn, [0, 1], [30, 0]);
        const slideOut = interpolate(fadeOut, [1, 0], [0, -30]);
        transform = `translateY(${slideIn + slideOut}px)`;
    } else if (animation === 'zoom') {
        const scaleIn = interpolate(fadeIn, [0, 1], [0.8, 1]);
        const scaleOut = interpolate(fadeOut, [1, 0], [1, 1.1]);
        transform = `scale(${scaleIn * scaleOut})`;
    }

    // Typewriter effect
    let displayedText = text;
    if (animation === 'typewriter') {
        const charsToDisplay = Math.floor(interpolate(frame, [delayInFrames, delayInFrames + text.length * 2], [0, text.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
        displayedText = text.substring(0, charsToDisplay);
    }

    return (
        <AbsoluteFill
            style={{
                justifyContent: justifyMap[position],
                alignItems: 'center',
                padding: position === 'center' ? 40 : '80px 40px',
                pointerEvents: 'none',
            }}
        >
            <div
                style={{
                    textAlign: 'center',
                    color,
                    fontSize,
                    fontWeight: 700,
                    maxWidth: '85%',
                    opacity,
                    transform,
                    lineHeight: 1.4,
                    textShadow: '0 2px 20px rgba(0,0,0,0.8), 0 4px 40px rgba(0,0,0,0.5)',
                    letterSpacing: '-0.5px',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
            >
                {displayedText}
            </div>
        </AbsoluteFill>
    );
};
