/**
 * caption-styles.tsx — styled caption variants re-implemented from MIT study
 * repos (ahgsql/remotion-subtitles NeonCaption/GlowCaption patterns).
 *
 * Each style is a pure Remotion component using useCurrentFrame + interpolate
 * + CSS text-shadow glow. No external/web font dependency (system sans-serif
 * with bold weight), so it renders identically offline.
 *
 * These are OPTIONAL styles for KaraokeCaptions — wired via a `style` prop so
 * the existing karaoke behaviour is unchanged unless a style is requested.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';

export type CaptionStyleKind = 'neon' | 'glow' | 'pop' | 'fire' | 'glitch' | 'typewriter';

interface StyleProps {
    text: string;
    accent?: string;
    position?: 'top' | 'center' | 'bottom';
    fontSize?: number;
}

function posToFlex(position: StyleProps['position']): React.CSSProperties {
    switch (position) {
        case 'top':
            return { justifyContent: 'flex-start', paddingTop: 60 };
        case 'center':
            return { justifyContent: 'center' };
        case 'bottom':
        default:
            return { justifyContent: 'flex-end', paddingBottom: 90 };
    }
}

const NeonCaption: React.FC<StyleProps & { frame: number }> = ({ text, accent = '#00eaff', frame, fontSize = 56 }) => {
    const opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
    const glow = `rgba(0,234,255,${opacity})`;
    return (
        <div
            style={{
                opacity,
                fontFamily: 'system-ui, sans-serif',
                fontSize,
                fontWeight: 800,
                color: '#fff',
                textAlign: 'center',
                textShadow: `0 0 8px ${glow}, 0 0 18px ${glow}, 0 0 30px ${accent}, 0 0 42px ${accent}`,
                letterSpacing: 1,
            }}
        >
            {text}
        </div>
    );
};

const GlowCaption: React.FC<StyleProps & { frame: number }> = ({ text, accent = '#FF6B35', frame, fontSize = 54 }) => {
    const pulse = interpolate(frame, [0, 15], [0.55, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });
    return (
        <div
            style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize,
                fontWeight: 800,
                color: '#fff',
                textAlign: 'center',
                textShadow: `0 0 10px ${accent}, 0 0 22px ${accent}, 0 2px 16px rgba(0,0,0,0.85)`,
                transform: `scale(${pulse})`,
                opacity: 1,
            }}
        >
            {text}
        </div>
    );
};

const PopCaption: React.FC<StyleProps & { frame: number }> = ({ text, accent = '#FFD93D', frame, fontSize = 60 }) => {
    const pop = interpolate(frame, [0, 8], [0.4, 1], { extrapolateRight: 'clamp', easing: Easing.elastic(1) });
    return (
        <div
            style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize,
                fontWeight: 900,
                color: '#fff',
                textAlign: 'center',
                textShadow: `0 0 6px rgba(0,0,0,0.6), 0 0 16px ${accent}`,
                transform: `scale(${pop})`,
                textTransform: 'uppercase',
            }}
        >
            {text}
        </div>
    );
};

const FireCaption: React.FC<StyleProps & { frame: number }> = ({ text, accent = '#FF6B35', frame, fontSize = 54 }) => {
    const flicker = interpolate(frame % 10, [0, 5, 10], [0.8, 1, 0.85], { extrapolateRight: 'clamp' });
    return (
        <div
            style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize,
                fontWeight: 800,
                color: '#fff',
                textAlign: 'center',
                textShadow: `0 0 8px ${accent}, 0 0 18px #ff3d00, 0 0 30px #ff8c00, 0 0 44px #ffb300`,
                opacity: flicker,
                transform: `scale(${0.98 + 0.04 * Math.sin(frame / 3)})`,
            }}
        >
            {text}
        </div>
    );
};

const GlitchCaption: React.FC<StyleProps & { frame: number }> = ({ text, accent = '#39FF14', frame, fontSize = 56 }) => {
    const shift = frame % 6 < 3 ? 2 : -2;
    return (
        <div style={{ position: 'relative', textAlign: 'center' }}>
            <span style={{ position: 'absolute', left: -shift, color: '#ff00c8', fontSize, fontWeight: 800, opacity: 0.7 }}>{text}</span>
            <span style={{ position: 'absolute', left: shift, color: '#00fff2', fontSize, fontWeight: 800, opacity: 0.7 }}>{text}</span>
            <span style={{ position: 'relative', color: '#fff', fontSize, fontWeight: 800, textShadow: `0 0 10px ${accent}` }}>{text}</span>
        </div>
    );
};

const TypewriterCaption: React.FC<StyleProps & { frame: number }> = ({ text, accent = '#FFD93D', frame, fontSize = 54 }) => {
    const shown = Math.min(text.length, Math.max(0, Math.round(frame / 2)));
    const caret = frame % 20 < 10 ? '▌' : '';
    return (
        <div style={{ fontFamily: 'monospace', fontSize, fontWeight: 700, color: '#fff', textAlign: 'center', textShadow: `0 0 10px ${accent}`, letterSpacing: 1 }}>
            {text.slice(0, shown)}
            {shown < text.length ? caret : ''}
        </div>
    );
};

/** Styled caption wrapper — picks a variant by kind. */
export const StyledCaption: React.FC<StyleProps & { kind: CaptionStyleKind }> = ({ kind, ...rest }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    void fps;
    let node: React.ReactNode;
    switch (kind) {
        case 'neon':
            node = <NeonCaption {...rest} frame={frame} />;
            break;
        case 'glow':
            node = <GlowCaption {...rest} frame={frame} />;
            break;
        case 'pop':
            node = <PopCaption {...rest} frame={frame} />;
            break;
        case 'fire':
            node = <FireCaption {...rest} frame={frame} />;
            break;
        case 'glitch':
            node = <GlitchCaption {...rest} frame={frame} />;
            break;
        case 'typewriter':
            node = <TypewriterCaption {...rest} frame={frame} />;
            break;
        default:
            node = <PopCaption {...rest} frame={frame} />;
    }
    return (
        <AbsoluteFill
            style={{
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...posToFlex(rest.position),
            }}
        >
            {node}
        </AbsoluteFill>
    );
};

export const CAPTION_STYLES: CaptionStyleKind[] = ['neon', 'glow', 'pop', 'fire', 'glitch', 'typewriter'];
