import React from 'react';
import {
    AbsoluteFill,
    Audio,
    OffthreadVideo,
    Img,
    Sequence,
    staticFile,
    useVideoConfig,
    useCurrentFrame,
    interpolate,
    Easing,
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
    } | null;
    audioPath?: string;
}

interface VideoData {
    scenes: Scene[];
    totalDuration: number;
    style: string;
    showText?: boolean;
}

// Transition duration in frames
const FADE_DURATION = 12; // 0.4 seconds at 30fps

export const MainVideo: React.FC<{ sceneData: VideoData }> = ({
    sceneData
}) => {
    const { fps } = useVideoConfig();

    // console.log('MainVideo: Rendered', { sceneData, fps });

    const videoData = sceneData || {
        scenes: [],
        totalDuration: 30,
        style: 'professional',
    };

    if (!sceneData) {
        // console.warn('MainVideo: No sceneData provided, using default fallback data');
    }

    let currentFrame = 0;

    return (
        <AbsoluteFill style={{ backgroundColor: '#000' }}>
            {videoData.scenes.map((scene, index) => {
                const sceneDurationInFrames = Math.round(scene.duration * fps);
                const sequenceStart = currentFrame;
                currentFrame += sceneDurationInFrames;

                // console.log(`MainVideo: Mapping scene ${index}`, {
                //     sceneNumber: scene.sceneNumber,
                //     sequenceStart,
                //     durationInFrames: sceneDurationInFrames,
                //     totalCurrentFrame: currentFrame
                // });

                return (
                    <Sequence
                        key={scene.sceneNumber}
                        from={sequenceStart}
                        durationInFrames={sceneDurationInFrames}
                    >
                        <SceneComponent
                            scene={scene}
                            durationInFrames={sceneDurationInFrames}
                            showText={videoData.showText !== false}
                        />
                        {scene.audioPath && scene.audioPath.endsWith('.mp3') && (
                            (() => {
                                const audioFile = scene.audioPath!.split(/[/\\]/).pop();
                                // console.log(`MainVideo: Processing audio for scene ${scene.sceneNumber}`, {
                                //     originalPath: scene.audioPath,
                                //     resolvedFile: audioFile,
                                //     staticFilePath: staticFile(`audio/${audioFile}`)
                                // });
                                return (
                                    <Audio
                                        src={staticFile(`audio/${audioFile}`)}
                                        volume={1.0}
                                    />
                                );
                            })()
                        )}
                    </Sequence>
                );
            })}
        </AbsoluteFill>
    );
};

interface SceneProps {
    scene: Scene;
    durationInFrames: number;
    showText?: boolean;
}

const SceneComponent: React.FC<SceneProps> = ({ scene, durationInFrames, showText = true }) => {
    // console.log(`SceneComponent: Rendered scene ${scene.sceneNumber}`, { scene, durationInFrames });
    const frame = useCurrentFrame();
    const hasLocalVideo = scene.visual?.localPath;

    // Determine visual mode for logging
    const visualMode = (scene.visual && hasLocalVideo)
        ? 'local-video'
        : (scene.visual ? 'remote-image' : 'gradient-fallback');

    // console.log(`SceneComponent: Visual logic for scene ${scene.sceneNumber}`, {
    //     hasVisual: !!scene.visual,
    //     hasLocalVideo: !!hasLocalVideo,
    //     visualMode,
    //     localPath: hasLocalVideo ? scene.visual?.localPath : undefined,
    //     remoteUrl: (!hasLocalVideo && scene.visual) ? scene.visual.url : undefined
    // });

    if (visualMode === 'local-video' && scene.visual?.localPath) {
        // console.log(`SceneComponent: Resolving video path for scene ${scene.sceneNumber}`, {
        //     staticPath: staticFile(scene.visual.localPath)
        // });
    }

    // Simple crossfade - fade in at start
    const fadeIn = interpolate(
        frame,
        [0, FADE_DURATION],
        [0, 1],
        {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.quad),
        }
    );

    // Fade out at end
    const fadeOut = interpolate(
        frame,
        [durationInFrames - FADE_DURATION, durationInFrames],
        [1, 0],
        {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.in(Easing.quad),
        }
    );

    // Combined opacity - simple crossfade
    const opacity = Math.min(fadeIn, fadeOut);

    // Text fade with slight delay after video fades in
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

    // Subtle text slide up
    const textSlide = interpolate(textOpacity, [0, 1], [15, 0]);

    // console.log(`SceneComponent: Frame calculations for scene ${scene.sceneNumber}`, {
    //     frame,
    //     fadeIn,
    //     fadeOut,
    //     opacity,
    //     textOpacity,
    //     textFadeOut,
    //     combinedTextOpacity,
    //     textSlide
    // });

    return (
        <AbsoluteFill
            style={{
                backgroundColor: '#0a0a0a',
            }}
        >
            {/* Background Video - STABLE, NO TRANSFORMS, OFFTHREAD */}
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
            {showText && (
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
            )}
        </AbsoluteFill>
    );
};
