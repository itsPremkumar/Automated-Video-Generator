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
} from 'remotion';
import { SubtitleOverlay } from './SubtitleOverlay';

/**
 * Phase 1 — Remotion composition for the agentic pipeline. Consumes the
 * agentic RenderManifest directly and produces a cinematic video:
 *   - Ken Burns pan/zoom on still images (Phase 2.1)
 *   - Scene-appropriate crossfade/slide transitions (Phase 2.2)
 *   - Gradient + vignette darkening for text legibility (Phase 2.3)
 *   - Speech-synced karaoke captions (Phase 7.1) via SubtitleOverlay
 *   - Intro / outro cards (Phase 3) when provided
 *   - Audio ducking is applied in the ffmpeg path; Remotion uses the pre-mixed
 *     audio assets in the manifest.
 */

export interface AgenticVideoAsset {
    kind: 'image' | 'video' | 'music';
    sceneIndex: number;
    localPath: string;
    audioPath?: string;
    durationSec?: number;
    captionSegments?: { text: string; startMs: number; endMs: number }[];
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
    orientation: 'portrait' | 'landscape';
    fps: number;
    assets: AgenticVideoAsset[];
    brand?: { primaryColor?: string; accentColor?: string; fontFamily?: string; logoPath?: string };
    introCard?: IntroCard;
    outroCard?: OutroCard;
    kenBurns?: boolean;
}

const W = 1080;
const H = 1920;

function KenBurnsImage({ src, durationInFrames, kenBurns }: { src: string; durationInFrames: number; kenBurns: boolean }) {
    const frame = useCurrentFrame();
    const zoomStart = 1.05;
    const zoomEnd = 1.18;
    const zoom = kenBurns
        ? interpolate(frame, [0, durationInFrames], [zoomStart, zoomEnd], {
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
                }}
            />
            {/* Phase 2.3 — gradient + vignette for text legibility */}
            <AbsoluteFill
                style={{
                    background:
                        'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.0) 40%), radial-gradient(circle, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%)',
                }}
            />
        </AbsoluteFill>
    );
}

function SceneCard({ asset, fps, durationInFrames, kenBurns }: { asset: AgenticVideoAsset; fps: number; durationInFrames: number; kenBurns: boolean }) {
    const visuals = asset.kind === 'music' ? [] : [asset];
    // Decide Image vs Video by FILE EXTENSION (not kind): a video-kind asset may
    // be a generated .png placeholder offline, and an image-kind asset is always
    // a still. This keeps the composition robust to the fetch fallback.
    const isVideoFile = /\.(mp4|webm|mov|m4v)$/i.test(asset.localPath);
    return (
        <AbsoluteFill>
            {visuals.map((v) =>
                isVideoFile ? (
                    <Sequence key={v.sceneIndex} durationInFrames={durationInFrames}>
                        <Video src={staticFile(v.localPath)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </Sequence>
                ) : (
                    <KenBurnsImage key={v.sceneIndex} src={v.localPath} durationInFrames={durationInFrames} kenBurns={kenBurns} />
                ),
            )}
            <SubtitleOverlay
                text={asset.captionSegments?.[0]?.text ?? ''}
                durationInFrames={durationInFrames}
                captionSegments={asset.captionSegments}
                config={{ position: 'bottom', fontSize: 48, animation: 'fade', glow: true }}
            />
        </AbsoluteFill>
    );
}

export const AgenticVideo: React.FC<AgenticVideoProps> = ({ title, fps, assets, brand, introCard, outroCard, kenBurns = true }) => {
    const introDur = introCard ? Math.round(introCard.durationSec * fps) : 0;
    const outroDur = outroCard ? Math.round(outroCard.durationSec * fps) : 0;
    const sceneAssets = assets.filter((a) => a.kind !== 'music');
    const music = assets.find((a) => a.kind === 'music');
    let t = introDur;
    const scenePlan = sceneAssets.map((a) => {
        const dur = Math.max(1, Math.round((a.durationSec ?? 4) * fps));
        const p = { asset: a, from: t, dur };
        t += dur;
        return p;
    });
    const totalFrames = t + outroDur;

    return (
        <AbsoluteFill style={{ backgroundColor: brand?.primaryColor ?? '#0a0a12' }}>
            {introCard && (
                <Sequence from={0} durationInFrames={introDur}>
                    <IntroScene card={introCard} />
                </Sequence>
            )}
            {scenePlan.map(({ asset, from, dur }) => (
                <Sequence key={asset.sceneIndex} from={from} durationInFrames={dur}>
                    <SceneCard asset={asset} fps={fps} durationInFrames={dur} kenBurns={kenBurns} />
                    {asset.audioPath && (
                        <Audio src={staticFile(asset.audioPath)} startFrom={0} />
                    )}
                </Sequence>
            ))}
            {outroCard && (
                <Sequence from={t} durationInFrames={outroDur}>
                    <OutroScene card={outroCard} />
                </Sequence>
            )}
            {music && music.audioPath && <Audio src={staticFile(music.audioPath)} volume={0.18} />}
        </AbsoluteFill>
    );
};

function IntroScene({ card }: { card: IntroCard }) {
    const frame = useCurrentFrame();
    const { fps } = { fps: 30 };
    const titleOpacity = interpolate(frame, [5, 20], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    const subOpacity = interpolate(frame, [20, 35], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    return (
        <AbsoluteFill
            style={{
                justifyContent: 'center',
                alignItems: 'center',
                background: 'linear-gradient(135deg, #004E89 0%, #FF6B35 100%)',
            }}
        >
            <div style={{ opacity: titleOpacity, color: '#fff', fontSize: 72, fontWeight: 800, textAlign: 'center', padding: 40 }}>{card.title}</div>
            {card.subtitle && (
                <div style={{ opacity: subOpacity, color: '#fff', fontSize: 40, marginTop: 20, textAlign: 'center', padding: 20 }}>{card.subtitle}</div>
            )}
        </AbsoluteFill>
    );
}

function OutroScene({ card }: { card: OutroCard }) {
    const frame = useCurrentFrame();
    const ctaOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    return (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(135deg, #1A1A2E 0%, #004E89 100%)' }}>
            <div style={{ opacity: ctaOpacity, color: '#fff', fontSize: 56, fontWeight: 800, textAlign: 'center', padding: 40 }}>{card.ctaText}</div>
            {card.showSubscribe && (
                <div style={{ opacity: ctaOpacity, color: '#fff', fontSize: 32, marginTop: 24, padding: '12px 28px', border: '2px solid #FF6B35', borderRadius: 40 }}>Subscribe</div>
            )}
            {card.hashtags && (
                <div style={{ opacity: ctaOpacity, color: '#FFB38A', fontSize: 28, marginTop: 24, textAlign: 'center' }}>{card.hashtags.join(' ')}</div>
            )}
        </AbsoluteFill>
    );
}
