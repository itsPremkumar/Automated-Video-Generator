import React from 'react';
import {
    AbsoluteFill,
    useCurrentFrame,
    interpolate,
    Easing,
    Img,
    Sequence,
    Audio,
    Video,
    staticFile,
    useVideoConfig,
} from 'remotion';
import { SubtitleOverlay } from './SubtitleOverlay';
import { KaraokeCaptions } from './KaraokeCaptions';
import { IntroSceneCard, OutroSceneCard } from './IntroOutroCards';
import { VoiceoverWaveform } from './VoiceoverWaveform';
import { AgenticTransitionSeries, type RichTransitionKind } from './transitions';
import { MotionBlur } from './motion-effects';
import { KineticText } from './kinetic-text';
import { ShapeAccent } from './shape-accents';
import { Animated } from './animated-entrances';

/**
 * Phase-1 agentic Remotion composition — driven to an advanced level:
 *   A1  Scene transitions  — manual crossfade / slide / cut between scenes
 *                            (overlapping Sequences + opacity/translate).
 *   A2  Color grading     — CSS `filter` (saturate/contrast/brightness) per
 *                            scene, derived from computeStylePlan().grade.
 *   A3  Kinetic text      — lower-third + word-pop cues from stylePlan.kinetic.
 *   A4  Gradient/vignette — already on KenBurnsImage + video scenes.
 *   A5  Music ducking     — music volume dips under each voiceover scene.
 *   A6  Aspect-aware      — width/height come from props (portrait/landscape/
 *                            square) instead of a hardcoded 1080x1920.
 *   A7  Caption position  — read from asset.textConfig.position.
 *   A10 Branded fallback  — brand-colored backing behind missing video.
 *   A11 Caption hold      — SubtitleOverlay already holds the last cue.
 *
 * NOTE: this composition is the *agentic* path. The ffmpeg path already does
 * all of the above; this file brings Remotion to parity so either renderer
 * produces a human-feel result.
 */

export type TransitionKind = 'fade' | 'slide' | 'cut';
export type GradeKind = 'neutral' | 'warm' | 'cool' | 'cinematic' | 'vivid';

export interface KineticCue {
    atSec: number;
    text: string;
    kind: 'lowerthird' | 'wordpop';
}

export interface AgenticVideoAsset {
    kind: 'image' | 'video' | 'music';
    sceneIndex: number;
    localPath: string;
    audioPath?: string;
    durationSec?: number;
    captionSegments?: { text: string; startMs: number; endMs: number }[];
    /** A1 — transition used to ENTER this scene (scene 0 = none). */
    transitionIn?: TransitionKind;
    /** A2 — color grade. */
    grade?: GradeKind;
    /** A3 — kinetic text cues. */
    kinetic?: KineticCue[];
    /** A7 — caption placement. */
    textConfig?: { position?: 'top' | 'center' | 'bottom'; fontSize?: number };
    /** A5 — true when this scene carries voiceover (used for music ducking). */
    hasVoice?: boolean;
    license?: string;
}

export interface IntroCard {
    title: string;
    subtitle?: string;
    durationSec: number;
}
export interface OutroCard {
    ctaText: string;
    showSubscribe: boolean;
    hashtags?: string[];
    durationSec: number;
}

export interface AgenticVideoProps {
    title: string;
    orientation?: 'portrait' | 'landscape' | 'square';
    fps: number;
    assets: AgenticVideoAsset[];
    brand?: { primaryColor?: string; accentColor?: string; fontFamily?: string; logoPath?: string };
    introCard?: IntroCard;
    outroCard?: OutroCard;
    kenBurns?: boolean;
    /** A6 — explicit dimensions (overrides orientation). */
    width?: number;
    height?: number;
    /** A1 — crossfade length in seconds. */
    crossfadeSec?: number;
    /** c16 — use @remotion/transitions (circleWipe/flip/slide) instead of manual fade. */
    richTransitions?: boolean;
    /** c16 — styled-caption variant for karaoke (neon/glow/pop/fire/glitch/typewriter). */
    captionStyle?: 'neon' | 'glow' | 'pop' | 'fire' | 'glitch' | 'typewriter';
    /** c16b — apply CameraMotionBlur to moving scene layers (cinematic). */
    motionBlur?: boolean;
    /** c16c — render intro/outro titles with per-character kinetic spring text. */
    kineticTitle?: boolean;
    /** c16d — render decorative @remotion/shapes accents (star/circle/polygon/arrow). */
    shapeAccents?: boolean;
}

function dimsFromProps(p: AgenticVideoProps): { w: number; h: number } {
    if (p.width && p.height) return { w: p.width, h: p.height };
    switch (p.orientation) {
        case 'landscape':
            return { w: 1920, h: 1080 };
        case 'square':
            return { w: 1080, h: 1080 };
        case 'portrait':
        default:
            return { w: 1080, h: 1920 };
    }
}

/** A2 — map a grade to a CSS filter string. */
function gradeToFilter(grade?: GradeKind): string {
    switch (grade) {
        case 'warm':
            return 'saturate(1.15) contrast(1.05) brightness(1.04) sepia(0.12) hue-rotate(-8deg)';
        case 'cool':
            return 'saturate(1.05) contrast(1.05) brightness(0.99) hue-rotate(6deg)';
        case 'cinematic':
            return 'saturate(0.92) contrast(1.18) brightness(0.96)';
        case 'vivid':
            return 'saturate(1.35) contrast(1.1) brightness(1.05)';
        case 'neutral':
        default:
            return 'saturate(1.05) contrast(1.02) brightness(1.0)';
    }
}

function KenBurnsImage({
    src,
    durationInFrames,
    kenBurns,
    grade,
}: {
    src: string;
    durationInFrames: number;
    kenBurns: boolean;
    grade?: GradeKind;
}) {
    const frame = useCurrentFrame();
    const zoom = kenBurns
        ? interpolate(frame, [0, durationInFrames], [1.05, 1.18], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.inOut(Easing.cubic),
          })
        : 1;
    const pan = kenBurns
        ? interpolate(frame, [0, durationInFrames], [0, -30], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.inOut(Easing.cubic),
          })
        : 0;
    return (
        <AbsoluteFill style={{ backgroundColor: '#000' }}>
            <Img
                src={staticFile(src)}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: `scale(${zoom}) translateY(${pan}px)`,
                    filter: gradeToFilter(grade),
                }}
            />
            <AbsoluteFill
                style={{
                    background:
                        'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.0) 40%), radial-gradient(circle, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)',
                }}
            />
        </AbsoluteFill>
    );
}

/** A3 — kinetic lower-third / word-pop layer. */
function KineticLayer({
    cues,
    durationInFrames,
    fps,
    accent,
}: {
    cues: KineticCue[];
    durationInFrames: number;
    fps: number;
    accent: string;
}) {
    const frame = useCurrentFrame();
    const now = frame / fps;
    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            {cues.map((c, i) => {
                const start = c.atSec * fps;
                const len = c.kind === 'wordpop' ? 0.9 * fps : 2.6 * fps;
                const end = start + len;
                const opacity = interpolate(frame, [start, start + 8, end - 8, end], [0, 1, 1, 0], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                });
                const pop =
                    c.kind === 'wordpop'
                        ? interpolate(frame, [start, start + 10], [0.6, 1], {
                              extrapolateLeft: 'clamp',
                              extrapolateRight: 'clamp',
                              easing: Easing.elastic(1),
                          })
                        : 1;
                if (frame < start || frame > end) return null;
                return (
                    <AbsoluteFill
                        key={i}
                        style={{
                            justifyContent: c.kind === 'wordpop' ? 'center' : 'flex-end',
                            alignItems: 'center',
                            padding: c.kind === 'wordpop' ? 40 : '90px 40px',
                        }}
                    >
                        <div
                            style={{
                                opacity,
                                transform: `scale(${pop})`,
                                color: '#fff',
                                fontWeight: 800,
                                textAlign: 'center',
                                fontSize: c.kind === 'wordpop' ? 64 : 40,
                                letterSpacing: 1,
                                textShadow: `0 0 14px ${accent}, 0 2px 18px rgba(0,0,0,0.8)`,
                                textTransform: c.kind === 'wordpop' ? 'uppercase' : 'none',
                                background: c.kind === 'lowerthird' ? 'rgba(0,0,0,0.35)' : 'transparent',
                                padding: c.kind === 'lowerthird' ? '10px 22px' : 0,
                                borderRadius: 14,
                                maxWidth: '86%',
                            }}
                        >
                            {c.text}
                        </div>
                    </AbsoluteFill>
                );
            })}
        </AbsoluteFill>
    );
}

function SceneVisual({
    asset,
    durationInFrames,
    kenBurns,
    grade,
}: {
    asset: AgenticVideoAsset;
    durationInFrames: number;
    kenBurns: boolean;
    grade?: GradeKind;
}) {
    const isVideoFile = /\.(mp4|webm|mov|m4v)$/i.test(asset.localPath);
    if (isVideoFile) {
        return (
            <AbsoluteFill>
                <AbsoluteFill style={{ backgroundColor: '#0F3460' }} />
                <Video
                    src={staticFile(asset.localPath)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', filter: gradeToFilter(grade) }}
                />
                <AbsoluteFill
                    style={{
                        background:
                            'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.0) 40%), radial-gradient(circle, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)',
                    }}
                />
            </AbsoluteFill>
        );
    }
    return (
        <KenBurnsImage src={asset.localPath} durationInFrames={durationInFrames} kenBurns={kenBurns} grade={grade} />
    );
}

/**
 * A1 — TransitionedScene wraps a scene so it crossfades/slides into the
 * previous one. `overlap` frames of overlap are rendered at both ends; opacity
 * (or translateX for slide) interpolates across the boundary. Scene 0 never
 * fades in; a 'cut' transition renders with no overlap (hard cut).
 */
function TransitionedScene({
    asset,
    fps,
    durationInFrames,
    from,
    overlap,
    transition,
    kenBurns,
    accent,
    captionStyle,
}: {
    asset: AgenticVideoAsset;
    fps: number;
    durationInFrames: number;
    from: number;
    overlap: number;
    transition: TransitionKind;
    kenBurns: boolean;
    accent: string;
    captionStyle?: 'neon' | 'glow' | 'pop' | 'fire' | 'glitch' | 'typewriter';
}) {
    const frame = useCurrentFrame();
    const local = frame - from;
    const isFirst = from === 0;
    const fadeIn =
        isFirst || transition === 'cut'
            ? 1
            : interpolate(local, [0, overlap], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
              });
    const fadeOut =
        transition === 'cut'
            ? 1
            : interpolate(local, [durationInFrames - overlap, durationInFrames], [1, 0], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  easing: Easing.in(Easing.cubic),
              });
    const opacity = Math.min(fadeIn, fadeOut);
    const slideX =
        transition === 'slide' && !isFirst
            ? interpolate(local, [0, overlap], [Math.round(dimsFromPropsWidth(asset) * 0.12), 0], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                  easing: Easing.out(Easing.cubic),
              })
            : 0;
    return (
        <AbsoluteFill style={{ opacity, transform: slideX ? `translateX(${slideX}px)` : undefined }}>
            <SceneVisual asset={asset} durationInFrames={durationInFrames} kenBurns={kenBurns} grade={asset.grade} />
            <SubtitleOverlay
                text={asset.captionSegments?.[0]?.text ?? ''}
                durationInFrames={durationInFrames}
                captionSegments={asset.captionSegments}
                config={{
                    position: asset.textConfig?.position ?? 'bottom',
                    fontSize: asset.textConfig?.fontSize ?? 48,
                    animation: 'fade',
                    glow: true,
                }}
            />
            {/* A8 — true word-level karaoke via @remotion/captions (Remotion's
                production caption engine). Used when speech-timed cues exist;
                auto-wraps and highlights the spoken word like pro shorts. */}
            {asset.captionSegments && asset.captionSegments.length > 0 && (
                <KaraokeCaptions
                    captionSegments={asset.captionSegments}
                    accentColor={accent}
                    fontSize={asset.textConfig?.fontSize ?? 48}
                    position={asset.textConfig?.position ?? 'bottom'}
                    style={captionStyle}
                />
            )}
            {asset.audioPath && (
                <VoiceoverWaveform audioPath={asset.audioPath} accent={accent} />
            )}
            {asset.kinetic && asset.kinetic.length > 0 && (
                <KineticLayer cues={asset.kinetic} durationInFrames={durationInFrames} fps={fps} accent={accent} />
            )}
            {asset.audioPath && <Audio src={staticFile(asset.audioPath)} startFrom={0} />}
        </AbsoluteFill>
    );
}

// helper so slide distance can use the composition width without a hook
let _widthForSlide = 1080;
function dimsFromPropsWidth(_a: AgenticVideoAsset): number {
    return _widthForSlide;
}

/** A5 — music ducking: dip under each voiceover scene, rise in gaps. */
function MusicDuck({
    src,
    scenes,
    fps,
    full = 0.18,
    duck = 0.06,
}: {
    src: string;
    scenes: { from: number; dur: number; hasVoice?: boolean }[];
    fps: number;
    full?: number;
    duck?: number;
}) {
    const frame = useCurrentFrame();
    const inVoice = scenes.some((s) => s.hasVoice && frame >= s.from && frame < s.from + s.dur);
    const vol = interpolate(Number(inVoice), [0, 1], [full, duck], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    return <Audio src={staticFile(src)} volume={vol} />;
}

export const AgenticVideo: React.FC<AgenticVideoProps> = ({
    title,
    fps,
    assets,
    brand,
    introCard,
    outroCard,
    kenBurns = true,
    crossfadeSec = 0.5,
    richTransitions = false,
    captionStyle,
    motionBlur = false,
    kineticTitle = false,
    shapeAccents = false,
}) => {
    const { width: vw } = useVideoConfig();
    _widthForSlide = vw || 1080;
    const accent = brand?.accentColor ?? '#FF6B35';
    const introDur = introCard ? Math.round(introCard.durationSec * fps) : 0;
    const outroDur = outroCard ? Math.round(outroCard.durationSec * fps) : 0;
    const sceneAssets = assets.filter((a) => a.kind !== 'music');
    const music = assets.find((a) => a.kind === 'music');
    const overlap = Math.max(0, Math.round(crossfadeSec * fps));

    let t = introDur;
    const scenePlan = sceneAssets.map((a) => {
        const dur = Math.max(1, Math.round((a.durationSec ?? 4) * fps));
        const p = { asset: a, from: t, dur, transition: (a.transitionIn ?? 'fade') as TransitionKind };
        t += dur;
        return p;
    });
    const totalFrames = t + outroDur;

    return (
        <AbsoluteFill style={{ backgroundColor: brand?.primaryColor ?? '#0a0a12' }}>
            {introCard && (
                <Sequence from={0} durationInFrames={introDur}>
                    <IntroSceneCard card={introCard} accent={accent} primary={brand?.primaryColor} />
                    {shapeAccents && <ShapeAccent kind="star" xPct={85} yPct={15} size={90} color={accent} spin />}
                    {kineticTitle && (
                        <KineticText text={introCard.title} fontSize={72} color="#fff" delay={0.1} />
                    )}
                </Sequence>
            )}
            {scenePlan.map(({ asset, from, dur, transition }) => (
                // overlap frames at tail so the next scene can crossfade in
                <Sequence key={asset.sceneIndex} from={from} durationInFrames={dur + overlap}>
                    {motionBlur ? (
                        <MotionBlur>
                            <TransitionedScene
                                asset={asset}
                                fps={fps}
                                durationInFrames={dur}
                                from={from}
                                overlap={overlap}
                                transition={transition}
                                kenBurns={kenBurns}
                                accent={accent}
                                captionStyle={captionStyle}
                            />
                        </MotionBlur>
                    ) : (
                        <TransitionedScene
                            asset={asset}
                            fps={fps}
                            durationInFrames={dur}
                            from={from}
                            overlap={overlap}
                            transition={transition}
                            kenBurns={kenBurns}
                            accent={accent}
                            captionStyle={captionStyle}
                        />
                    )}
                </Sequence>
            ))}
            {outroCard && (
                <Sequence from={t} durationInFrames={outroDur}>
                    <OutroSceneCard card={outroCard} accent={accent} primary={brand?.primaryColor} />
                    {shapeAccents && <ShapeAccent kind="polygon" xPct={15} yPct={85} size={90} color={accent} spin />}
                    {kineticTitle && (
                        <KineticText text={outroCard.ctaText} fontSize={56} color="#fff" delay={0.1} />
                    )}
                </Sequence>
            )}
            {music && music.audioPath && (
                <MusicDuck
                    src={music.audioPath}
                    scenes={scenePlan.map((s) => ({ from: s.from, dur: s.dur, hasVoice: s.asset.hasVoice }))}
                    fps={fps}
                />
            )}
        </AbsoluteFill>
    );
};
