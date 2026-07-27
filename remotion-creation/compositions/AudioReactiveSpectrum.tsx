import React, { useEffect, useRef, useState } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, staticFile, spring, interpolate } from 'remotion';
import { getAudioData, visualizeAudio } from '@remotion/media-utils';
import type { MediaUtilsAudioData } from '@remotion/media-utils';
import { THEME } from '../lib/theme';

const BARS = 64;

/**
 * Audio-reactive spectrum. If `audioFile` (relative public/ path) is provided,
 * bars react to the real audio via @remotion/media-utils. Otherwise it falls
 * back to lively procedural motion so the composition always renders.
 */
export const AudioReactiveSpectrum: React.FC<{ audioFile?: string; title?: string }> = ({
  audioFile,
  title = '♫ AUDIO REACTIVE',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [audioData, setAudioData] = useState<MediaUtilsAudioData | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    if (!audioFile || tried.current) return;
    tried.current = true;
    try {
      getAudioData(staticFile(audioFile))
        .then(setAudioData)
        .catch(() => setAudioData(null));
    } catch {
      setAudioData(null);
    }
  }, [audioFile]);

  const samples: number[] =
    audioData
      ? visualizeAudio({ audioData, frame, fps, numberOfSamples: (() => { let n = BARS; while ((n & (n - 1)) !== 0) n++; return n; })() })
      : Array.from({ length: BARS }, (_, i) =>
          0.5 +
          0.5 *
            Math.abs(
              Math.sin(frame * 0.09 + i * 0.3) * 0.6 + Math.sin(frame * 0.05 + i * 0.11) * 0.4,
            ),
        );

  const enter = spring({ frame, fps, config: { damping: 16 } });

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 540 }}>
        {samples.map((s, i) => {
          const h = Math.max(8, s * 520 * enter);
          const hue = (i / BARS) * 300 + frame * 0.5;
          return (
            <div
              key={i}
              style={{
                width: 18,
                height: h,
                borderRadius: 6,
                background: `hsl(${hue % 360}, 85%, 60%)`,
                boxShadow: `0 0 18px hsl(${hue % 360}, 85%, 60%)`,
              }}
            />
          );
        })}
      </div>
      <span style={{ position: 'absolute', bottom: 160, fontFamily: THEME.font, fontWeight: 700, fontSize: 44, color: THEME.text }}>
        {title}
      </span>
    </AbsoluteFill>
  );
};
