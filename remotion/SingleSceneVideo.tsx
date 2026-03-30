import React from 'react';
import {
    AbsoluteFill,
    Audio,
    OffthreadVideo,
    Img,
    staticFile,
    useVideoConfig,
    useCurrentFrame,
    interpolate,
    Easing,
    Loop,
} from 'remotion';

interface Scene {
    sceneNumber: number;
    duration: number;
    visualDescription: string;
    voiceoverText: string;
    searchKeywords: string[];
    visual?: {
        type: 'image' | 'video';
        url: string;
        width: number;
        height: number;
        localPath?: string;
        videoDuration?: number;
    } | null;
    audioPath?: string;
}

// Props interface for SingleSceneVideo component
export interface SingleSceneProps {
    scene: Scene;
    isFirstScene: boolean;
    isLastScene: boolean;
    [key: string]: unknown;  // Allow additional props for Remotion compatibility
}

// Transition duration in frames
const FADE_DURATION = 12; // 0.4 seconds at 30fps

/**
 * SingleSceneVideo - Renders a single scene for segmented rendering
 * Used when rendering videos scene-by-scene for memory efficiency
 */
export const SingleSceneVideo: React.FC<SingleSceneProps> = ({
    scene,
    isFirstScene,
    isLastScene,
}) => {
    const { fps, durationInFrames } = useVideoConfig();
    const frame = useCurrentFrame();
    const hasLocalVideo = scene.visual?.localPath;

    // Calculate video asset duration in frames for looping
    // Default to scene duration if not available (safe fallback)
    const videoAssetDurationInFrames = scene.visual?.videoDuration
        ? Math.round(scene.visual.videoDuration * fps)
        : durationInFrames;

    // Fade in only for first scene, fade out only for last scene
    // Middle scenes get no fade (seamless concatenation)
    const fadeIn = isFirstScene
        ? interpolate(
            frame,
            [0, FADE_DURATION],
            [0, 1],
            {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.out(Easing.quad),
            }
        )
        : 1;

    const fadeOut = isLastScene
        ? interpolate(
            frame,
            [durationInFrames - FADE_DURATION, durationInFrames],
            [1, 0],
            {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.in(Easing.quad),
            }
        )
        : 1;

    const opacity = Math.min(fadeIn, fadeOut);

    // Text animation
    const textOpacity = interpolate(
        frame,
        [FADE_DURATION * 0.5, FADE_DURATION * 1.2],
        [0, 1],
        {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.quad),
        }
    );

    const textFadeOut = interpolate(
        frame,
        [durationInFrames - FADE_DURATION * 1.2, durationInFrames - FADE_DURATION * 0.5],
        [1, 0],
        {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.in(Easing.quad),
        }
    );

    const combinedTextOpacity = Math.min(textOpacity, textFadeOut);
    const textSlide = interpolate(textOpacity, [0, 1], [15, 0]);

    return (
        <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
            {/* Background Video/Image */}
            {scene.visual && hasLocalVideo ? (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        opacity,
                    }}
                >
                    {scene.visual.type === 'video' ? (
                        <Loop durationInFrames={videoAssetDurationInFrames}>
                            <OffthreadVideo
                                src={staticFile(scene.visual.localPath!)}
                                startFrom={0}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                }}
                                muted
                                pauseWhenBuffering
                            />
                        </Loop>
                    ) : (
                        <Img
                            src={staticFile(scene.visual.localPath!)}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                            }}
                        />
                    )}
                    {/* Dark overlay */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            backgroundColor: 'rgba(0,0,0,0.4)',
                        }}
                    />
                </div>
            ) : scene.visual ? (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        opacity,
                    }}
                >
                    <Img
                        src={scene.visual.url}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                        }}
                    />
                    {/* Dark overlay */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            backgroundColor: 'rgba(0,0,0,0.5)',
                        }}
                    />
                </div>
            ) : (
                // Fallback gradient background
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                        opacity,
                    }}
                />
            )}

            {/* Text Overlay */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 40,
                }}
            >
                <div
                    style={{
                        textAlign: 'center',
                        color: '#fff',
                        maxWidth: '85%',
                        opacity: combinedTextOpacity,
                        transform: `translateY(${textSlide}px)`,
                    }}
                >
                    <h1
                        style={{
                            fontSize: 52,
                            fontWeight: 700,
                            lineHeight: 1.4,
                            textShadow: '0 2px 20px rgba(0,0,0,0.8), 0 4px 40px rgba(0,0,0,0.5)',
                            letterSpacing: '-0.5px',
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                        }}
                    >
                        {scene.voiceoverText}
                    </h1>
                </div>
            </div>

            {/* Audio */}
            {scene.audioPath && scene.audioPath.endsWith('.mp3') && (
                <Audio
                    src={staticFile(`audio/${scene.audioPath.split(/[/\\]/).pop()}`)}
                    volume={1.0}
                />
            )}
        </AbsoluteFill>
    );
};
