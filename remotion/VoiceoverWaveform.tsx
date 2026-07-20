/**
 * VoiceoverWaveform.tsx — animated voiceover waveform under captions, using
 * @remotion/media-utils (getAudioData + visualizeAudio). Pattern learned from
 * marcusstenbeck/remotion-audio-visualizers (MIT) but re-implemented with the
 * official media-utils API so it's license-clean and version-stable.
 *
 * Robustness: audio decode is async + can fail offline / on odd formats. If it
 * fails, we render NOTHING (graceful) — never crash the composition. The
 * component is OPTIONAL and only mounted when a scene has an audioPath.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { getAudioData, visualizeAudio, type MediaUtilsAudioData } from '@remotion/media-utils';

export const VoiceoverWaveform: React.FC<{
    audioPath: string;
    accent?: string;
    bars?: number;
    height?: number;
}> = ({ audioPath, accent = '#FF6B35', bars = 48, height = 80 }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const [audioData, setAudioData] = useState<MediaUtilsAudioData | null>(null);
    const [failed, setFailed] = useState(false);
    const tried = useRef(false);

    useEffect(() => {
        if (tried.current) return;
        tried.current = true;
        let cancelled = false;
        getAudioData(audioPath)
            .then((d) => {
                if (!cancelled) setAudioData(d);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [audioPath]);

    if (failed || !audioData) return null;

    const samples = visualizeAudio({
        audioData,
        frame,
        fps,
        numberOfSamples: bars,
    });
    const max = Math.max(1, ...samples);

    return (
        <AbsoluteFill
            style={{
                justifyContent: 'center',
                alignItems: 'flex-end',
                paddingBottom: 24,
                pointerEvents: 'none',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, height, opacity: 0.9 }}>
                {samples.map((s, i) => {
                    const h = Math.max(3, Math.round((s / max) * height));
                    return (
                        <div
                            key={i}
                            style={{
                                width: 4,
                                height: h,
                                borderRadius: 2,
                                background: accent,
                                opacity: 0.55 + 0.45 * (s / max),
                            }}
                        />
                    );
                })}
            </div>
        </AbsoluteFill>
    );
};
