import { AbsoluteFill, useCurrentFrame, spring, interpolate } from 'remotion';

const W = 1920;
const H = 1080;

// Rainbow color palette
const COLORS = [
  '#FF0000', '#FF7F00', '#FFFF00', '#00FF00',
  '#0000FF', '#4B0082', '#8B00FF'
];

export const PrismDispersion: React.FC = () => {
  const frame = useCurrentFrame();

  // Beam animation: 0-60 frames enter, then sustain
  const beamProgress = spring({ frame: Math.min(frame, 60), fps: 30, config: { damping: 15 } });

  // Beam widening after hitting prism
  const spread = interpolate(frame, [30, 90], [0, 0.8], { extrapolateRight: 'clamp' });

  // Pulsing glow
  const glow = interpolate(Math.sin(frame * 0.05), [-1, 1], [0.6, 1]);

  return (
    <AbsoluteFill style={{ background: '#0a0a14' }}>
      {/* Title */}
      <div style={{
        position: 'absolute', top: 40, width: W,
        textAlign: 'center', fontFamily: 'Arial, sans-serif',
      }}>
        <span style={{ color: '#7c3aed', fontSize: 20, letterSpacing: 4, opacity: 0.8 }}>
          DISPERSION
        </span>
      </div>

      {/* White light beam entering from left */}
      <div style={{
        position: 'absolute',
        left: 80,
        top: H / 2 - 4,
        width: interpolate(beamProgress, [0, 1], [0, 350]),
        height: 6,
        background: 'white',
        borderRadius: 3,
        boxShadow: `0 0 ${20 * glow}px rgba(255,255,255,${0.5 * glow})`,
        opacity: frame > 60 ? 1 : Math.min(frame / 20, 1),
      }} />

      {/* Prism (triangle) */}
      <div style={{
        position: 'absolute',
        left: 420,
        top: H / 2 - 120,
        width: 0, height: 0,
        borderLeft: '100px solid transparent',
        borderRight: '100px solid transparent',
        borderBottom: `240px solid rgba(124, 58, 237, ${0.5 + 0.3 * glow})`,
        opacity: Math.min(frame / 30, 1),
      }} />

      {/* Prism label */}
      <div style={{
        position: 'absolute', left: 370, top: H / 2 + 140,
        color: '#7c3aed', fontSize: 16, fontFamily: 'monospace',
        opacity: frame > 40 ? Math.min((frame - 40) / 20, 1) : 0,
      }}>
        PRISM
      </div>

      {/* Dispersed rainbow beams exiting prism to the right */}
      {COLORS.map((color, i) => {
        const angle = interpolate(i, [0, COLORS.length - 1], [-25, 25]);
        const delay = 30 + i * 5;
        const progress = frame > delay ? Math.min((frame - delay) / 30, 1) : 0;
        const beamLen = interpolate(progress, [0, 1], [0, 400 + i * 20]);
        const yOffset = (i - (COLORS.length - 1) / 2) * 18;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 520,
              top: H / 2 - 3 + yOffset,
              width: beamLen,
              height: 5,
              background: color,
              borderRadius: '0 3px 3px 0',
              opacity: progress,
              boxShadow: `0 0 ${8 * progress}px ${color}80`,
              transform: `rotate(${angle * progress}deg)`,
              transformOrigin: 'left center',
            }}
          />
        );
      })}

      {/* Color labels */}
      {COLORS.map((color, i) => {
        const delay = 50 + i * 5;
        const opacity = frame > delay ? Math.min((frame - delay) / 15, 1) : 0;
        const yOffset = (i - (COLORS.length - 1) / 2) * 18;

        return (
          <div
            key={`label-${i}`}
            style={{
              position: 'absolute',
              left: 940,
              top: H / 2 - 3 + yOffset,
              color,
              fontSize: 11,
              fontFamily: 'monospace',
              opacity,
              whiteSpace: 'nowrap',
            }}
          >
            ● {['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet'][i]}
          </div>
        );
      })}

      {/* Wavelength labels on each beam */}
      {COLORS.map((color, i) => {
        const delay = 55 + i * 5;
        const opacity = frame > delay ? Math.min((frame - delay) / 15, 1) : 0;
        const yOffset = (i - (COLORS.length - 1) / 2) * 18;
        const wavelengths = ['700nm', '620nm', '580nm', '530nm', '470nm', '440nm', '420nm'];

        return (
          <div
            key={`wl-${i}`}
            style={{
              position: 'absolute',
              left: 800,
              top: H / 2 + 30 + yOffset,
              color: '#888',
              fontSize: 10,
              fontFamily: 'monospace',
              opacity: opacity * 0.6,
            }}
          >
            {wavelengths[i]}
          </div>
        );
      })}

      {/* Wavelength arrow annotation */}
      <div style={{
        position: 'absolute', left: 790, top: H / 2 + 10,
        color: '#555', fontSize: 11, fontFamily: 'Arial',
        opacity: frame > 80 ? Math.min((frame - 80) / 20, 1) : 0,
      }}>
        Longer λ ──────────── Shorter λ
      </div>

      {/* Footer info */}
      <div style={{
        position: 'absolute', bottom: 40, width: W,
        textAlign: 'center', fontFamily: 'Arial',
      }}>
        <span style={{ color: '#555', fontSize: 13 }}>
          White light → Refraction → Dispersion → Visible Spectrum
        </span>
      </div>
    </AbsoluteFill>
  );
};
