import React from 'react';
import {
    AbsoluteFill,
    useCurrentFrame,
    interpolate,
    Easing,
    useVideoConfig,
} from 'remotion';

/**
 * Production-Grade Text Configuration
 */
export interface TextConfig {
    color?: string;
    fontSize?: number;
    position?: 'top' | 'center' | 'bottom';
    animation?: 'fade' | 'slide' | 'zoom' | 'typewriter' | 'pop';
    background?: 'none' | 'box' | 'glass';
    glow?: boolean;
}

interface SubtitleOverlayProps {
    text: string;
    config?: TextConfig;
    durationInFrames: number;
    delayInFrames?: number;
}

/**
 * Error Boundary for Subtitles
 * Ensures that a failure in the subtitle component doesn't crash the entire video render.
 */
class SubtitleErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error(' [RENDER-ERROR] SubtitleOverlay failed:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return null; // Fallback to no subtitles if crash occurs
        }
        return this.props.children;
    }
}

/**
 * Main Subtitle Overlay Component
 */
const SubtitleInternal: React.FC<SubtitleOverlayProps> = ({
    text,
    config = {},
    durationInFrames,
    delayInFrames = 12,
}) => {
    const frame = useCurrentFrame();
    const { width } = useVideoConfig();

    // Defensive check for empty or invalid text
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return null;
    }

    const {
        color = '#ffffff',
        fontSize = 52,
        position = 'bottom',
        animation = 'fade',
        background = 'none',
        glow = false,
    } = config;

    // --- Math Safety & Smart Scaling ---
    const safeFontSize = isNaN(fontSize) || !isFinite(fontSize) ? 52 : Math.max(12, fontSize);
    const charsPerLine = 22;
    const padding = 100;
    
    // Guard against width being 0 or NaN
    const safeWidth = isNaN(width) || width <= 0 ? 1920 : width;
    const maxFontSize = (safeWidth - padding) / (Math.max(1, text.length) / 1.5);
    const finalFontSize = text.length > charsPerLine ? Math.max(28, Math.min(safeFontSize, maxFontSize)) : safeFontSize;

    // --- Animation Constants ---
    const ANIM_DURATION = 15;
    const outStart = Math.max(ANIM_DURATION + delayInFrames, durationInFrames - ANIM_DURATION);

    // --- Animation Interpolations ---
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

    const opacity = isNaN(fadeIn) || isNaN(fadeOut) ? 1 : Math.min(fadeIn, fadeOut);

    // --- Position Logic ---
    const justifyMap = {
        top: 'flex-start',
        center: 'center',
        bottom: 'flex-end',
    } as const;

    // --- Animation Transforms ---
    let transform = 'none';
    
    if (animation === 'slide') {
        const slideIn = interpolate(fadeIn, [0, 1], [30, 0]);
        const slideOut = interpolate(fadeOut, [1, 0], [0, -30]);
        transform = `translateY(${slideIn + slideOut}px)`;
    } else if (animation === 'zoom') {
        const scaleIn = interpolate(fadeIn, [0, 1], [0.8, 1]);
        const scaleOut = interpolate(fadeOut, [1, 0], [1, 1.1]);
        transform = `scale(${scaleIn * scaleOut})`;
    } else if (animation === 'pop') {
        const scaleIn = interpolate(fadeIn, [0, 1], [0.4, 1], {
            easing: Easing.elastic(1.2)
        });
        const scaleOut = interpolate(fadeOut, [1, 0], [1, 0.8]);
        transform = `scale(${scaleIn * scaleOut})`;
    }

    // --- Typewriter Effect ---
    let displayedText = text;
    if (animation === 'typewriter') {
        const charsToDisplay = Math.floor(interpolate(frame, [delayInFrames, delayInFrames + text.length * 2], [0, text.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
        displayedText = text.substring(0, charsToDisplay);
    }

    // --- Background Styling ---
    const getBackgroundStyle = (): React.CSSProperties => {
        if (background === 'box') {
            return {
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                padding: '12px 24px',
                borderRadius: '16px',
            };
        }
        if (background === 'glass') {
            return {
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(10px) saturate(180%)',
                padding: '16px 32px',
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
            };
        }
        return {};
    };

    return (
        <AbsoluteFill
            style={{
                justifyContent: justifyMap[position] || 'flex-end',
                alignItems: 'center',
                padding: position === 'center' ? 40 : '80px 40px',
                pointerEvents: 'none',
            }}
        >
            <div
                style={{
                    textAlign: 'center',
                    color,
                    fontSize: finalFontSize,
                    fontWeight: 700,
                    maxWidth: '85%',
                    opacity,
                    transform,
                    lineHeight: 1.4,
                    textShadow: glow 
                        ? `0 0 10px ${color}, 0 0 20px ${color}88`
                        : '0 2px 20px rgba(0,0,0,0.8), 0 4px 40px rgba(0,0,0,0.5)',
                    letterSpacing: '-0.5px',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    ...getBackgroundStyle(),
                    transition: 'font-size 0.2s ease',
                }}
            >
                {displayedText}
            </div>
        </AbsoluteFill>
    );
};

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = (props) => (
    <SubtitleErrorBoundary>
        <SubtitleInternal {...props} />
    </SubtitleErrorBoundary>
);
