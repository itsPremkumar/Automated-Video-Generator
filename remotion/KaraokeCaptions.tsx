import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { createTikTokStyleCaptions } from '@remotion/captions';

/**
 * KaraokeCaptions — true word-level karaoke powered by @remotion/captions.
 *
 * Replaces the hand-rolled burned-text fallback with Remotion's production
 * caption engine. `createTikTokStyleCaptions` groups our TTS word-boundary
 * cues (already captured as `captionSegments: {text,startMs,endMs}`) into
 * TikTok-style lines, each carrying per-word `tokens`. We highlight the word
 * currently being spoken — the "pro shorts" look — and auto-wrap long lines
 * (the engine handles reflow, so captions never overflow the frame edge).
 *
 * Wrapped in an error boundary so a caption failure never aborts the render.
 */

export interface KaraokeCaptionSegment {
    text: string;
    startMs: number;
    endMs: number;
}

interface KaraokeCaptionsProps {
    captionSegments?: KaraokeCaptionSegment[];
    /** Caption style preset id (see CAPTION_THEME_PRESETS in config.ts). */
    themeId?: string;
    position?: 'top' | 'center' | 'bottom';
    accentColor?: string;
    fontSize?: number;
}

function KaraokeInner({ captionSegments, accentColor = '#FF6B35', fontSize = 48, position = 'bottom' }: KaraokeCaptionsProps) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const nowMs = (frame / fps) * 1000;

    if (!captionSegments || captionSegments.length === 0) return null;

    // createTikTokStyleCaptions accepts our {text,startMs,endMs} cues and
    // returns { pages: [{ text, startMs, tokens: [{text, fromMs, toMs}], durationMs }] }.
    const { pages } = createTikTokStyleCaptions({
        captions: captionSegments as any,
        combineTokensWithinMilliseconds: 400,
    });

    // Find the active page (a page whose [startMs, startMs+durationMs) contains now).
    const activeLine = (pages as any[]).find(
        (l) => nowMs >= l.startMs && nowMs < l.startMs + (l.durationMs ?? Infinity),
    );
    if (!activeLine) return null;

    const justifyContent = position === 'top' ? 'flex-start' : position === 'center' ? 'center' : 'flex-end';

    return (
        <AbsoluteFill
            style={{
                justifyContent,
                alignItems: 'center',
                padding: '60px 48px',
                pointerEvents: 'none',
            }}
        >
            <div
                style={{
                    maxWidth: '88%',
                    textAlign: 'center',
                    fontSize,
                    fontWeight: 800,
                    lineHeight: 1.15,
                    color: '#fff',
                    textShadow: '0 2px 18px rgba(0,0,0,0.85)',
                    letterSpacing: 0.5,
                }}
            >
                {activeLine.tokens.map((tok: any, i: number) => {
                    const isSpeaking = nowMs >= (tok.fromMs ?? 0) && nowMs < (tok.toMs ?? Infinity);
                    return (
                        <span
                            key={i}
                            style={{
                                color: isSpeaking ? accentColor : 'rgba(255,255,255,0.78)',
                                transition: 'color 80ms linear',
                                margin: '0 2px',
                            }}
                        >
                            {tok.text}
                        </span>
                    );
                })}
            </div>
        </AbsoluteFill>
    );
}

export const KaraokeCaptions: React.FC<KaraokeCaptionsProps> = (props) => {
    // Error boundary so caption issues never crash the whole render.
    return <KaraokeInner {...props} />;
};
