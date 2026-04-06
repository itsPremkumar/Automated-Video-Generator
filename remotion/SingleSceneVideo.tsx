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
import { SubtitleOverlay, TextConfig } from './SubtitleOverlay';

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
        videoTrimAfterFrames?: number;
    } | null;
    audioPath?: string;
    showText?: boolean;
}

// Props interface for SingleSceneVideo component
export interface SingleSceneProps {
    scene: Scene;
    isFirstScene: boolean;
    isLastScene: boolean;
    showText?: boolean;
    textConfig?: TextConfig;
    backgroundMusic?: string;
    musicVolume?: number;
    globalStartFrame?: number;
    [key: string]: unknown;  // Allow additional props for Remotion compatibility
}

// Transition duration in frames
const FADE_DURATION = 12; // 0.4 seconds at 30fps
const SAFE_VIDEO_END_BUFFER_FRAMES = 3;

const resolveStaticMediaPath = (mediaPath: string): string => {
    const normalized = mediaPath.replace(/\\/g, '/');

    if (/^[a-zA-Z]:\//.test(normalized) || normalized.startsWith('/')) {
        const basename = normalized.split('/').pop() || normalized;
        return `audio/${basename}`;
    }

    return normalized;
};

const getUsableVideoTrimAfterFrames = (
    scene: Scene,
    fps: number,
    durationInFrames: number
): number => {
    const explicitTrimFrames = scene.visual?.videoTrimAfterFrames;
    if (typeof explicitTrimFrames === 'number' && Number.isFinite(explicitTrimFrames) && explicitTrimFrames > 0) {
        return Math.max(1, Math.min(Math.floor(explicitTrimFrames), durationInFrames));
    }

    const durationBasedFrames = scene.visual?.videoDuration
        ? Math.floor(scene.visual.videoDuration * fps)
        : durationInFrames;
    const safeFrames = Math.max(1, durationBasedFrames - SAFE_VIDEO_END_BUFFER_FRAMES);

    return Math.max(1, Math.min(safeFrames, durationInFrames));
};

/**
 * SingleSceneVideo - Renders a single scene for segmented rendering
 * Used when rendering videos scene-by-scene for memory efficiency
 */
export const SingleSceneVideo: React.FC<SingleSceneProps> = ({
    scene,
    isFirstScene,
    isLastScene,
    showText = true,
    textConfig,
    backgroundMusic,
    musicVolume,
    globalStartFrame = 0,
}) => {
    const { fps, durationInFrames } = useVideoConfig();
    const frame = useCurrentFrame();
    const hasLocalVideo = scene.visual?.localPath;
    const hasRemoteImage = scene.visual?.type === 'image' && !hasLocalVideo;
    const videoTrimAfterFrames = getUsableVideoTrimAfterFrames(scene, fps, durationInFrames);
    const shouldLoopVideo = videoTrimAfterFrames < durationInFrames;

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
                        shouldLoopVideo ? (
                            <Loop durationInFrames={videoTrimAfterFrames}>
                                <OffthreadVideo
                                    src={staticFile(scene.visual.localPath!)}
                                    trimAfter={videoTrimAfterFrames}
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
                            <OffthreadVideo
                                src={staticFile(scene.visual.localPath!)}
                                trimAfter={videoTrimAfterFrames}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                }}
                                muted
                                pauseWhenBuffering
                            />
                        )
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
            ) : hasRemoteImage ? (
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
                        src={scene.visual!.url}
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
            {(scene.showText !== undefined ? scene.showText : showText) && (
                <SubtitleOverlay
                    text={scene.voiceoverText}
                    config={textConfig}
                    durationInFrames={durationInFrames}
                    delayInFrames={FADE_DURATION * 0.5}
                />
            )}

            {/* Voiceover Audio */}
            {scene.audioPath && (scene.audioPath.endsWith('.mp3') || scene.audioPath.endsWith('.wav')) && (
                <Audio
                    src={staticFile(resolveStaticMediaPath(scene.audioPath))}
                    volume={1.0}
                />
            )}

            {/* Global Background Music - Offset by globalStartFrame for continuity */}
            {backgroundMusic && (
                <Audio
                    src={staticFile(backgroundMusic)}
                    volume={typeof musicVolume === 'number' ? musicVolume : 0.15}
                    startFrom={globalStartFrame}
                    loop={true}
                />
            )}
        </AbsoluteFill>
    );
};
