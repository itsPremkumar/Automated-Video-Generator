import { AbsoluteFill, useCurrentFrame, interpolate, interpolateColors } from 'remotion';

const W = 1080;
const H = 1920;

export const AuroraShader: React.FC<{
  primaryColor?: string;
  secondaryColor?: string;
  speed?: number;
}> = ({
  primaryColor = '#00ff88',
  secondaryColor = '#ff44ff',
  speed = 1,
}) => {
  const frame = useCurrentFrame();
  const t = frame * 0.02 * speed;

  // Build aurora curtain layers
  const layers = 4;
  const curtains = [];
  for (let l = 0; l < layers; l++) {
    const offset = l * 0.7;
    const opacity = 0.15 + l * 0.08;
    const sway = Math.sin(t * 0.3 + offset * 1.2) * 120 + Math.sin(t * 0.15 + offset) * 60;
    const hump = Math.sin(t * 0.2 + offset * 0.8) * 80;
    const waveY = H * 0.25 + l * 120 + Math.sin(t * 0.5 + l) * 30;

    curtains.push(
      <div
        key={l}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: W,
          height: H,
          background: `linear-gradient(
            ${180 + sway * 0.05}deg,
            transparent 0%,
            ${primaryColor}66 ${30 + Math.sin(t + l) * 10}%,
            ${secondaryColor}44 ${55 + Math.sin(t * 0.7 + l) * 15}%,
            transparent 80%
          )`,
          opacity,
          transform: `translateX(${sway * 0.3}px) translateY(${hump * 0.2}px)
            skewX(${Math.sin(t * 0.1 + l) * 5}deg)`,
          filter: `blur(${8 + l * 4}px)`,
          borderRadius: '50%',
        }}
      />
    );
  }

  // Stars background
  const starSeeds = Array.from({ length: 80 }, (_, i) => ({
    x: ((i * 137.508) % 1) * W,
    y: ((i * 271.828) % 1) * H * 0.7,
    size: 1 + ((i * 7) % 3),
    twinkle: ((i * 3) % 100) / 100,
  }));

  return (
    <AbsoluteFill style={{ background: '#05051a', overflow: 'hidden' }}>
      {/* Stars */}
      {starSeeds.map((s, i) => {
        const twinkle = Math.sin(t * 2 + s.twinkle * Math.PI * 2) * 0.5 + 0.5;
        return (
          <div
            key={`s${i}`}
            style={{
              position: 'absolute',
              left: s.x,
              top: s.y,
              width: s.size,
              height: s.size,
              borderRadius: '50%',
              background: `rgba(255,255,255,${0.3 + 0.7 * twinkle})`,
            }}
          />
        );
      })}

      {/* Aurora curtains */}
      {curtains}

      {/* Ground silhouette */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        width: W,
        height: H * 0.25,
        background: 'linear-gradient(0deg, #0a0a1a 60%, transparent)',
      }} />

      {/* Ground glow reflection */}
      <div style={{
        position: 'absolute',
        bottom: H * 0.22,
        left: W * 0.2,
        width: W * 0.6,
        height: 80,
        background: `radial-gradient(ellipse, ${primaryColor}33 0%, transparent 70%)`,
        opacity: 0.3 + Math.sin(t * 0.3) * 0.15,
      }} />

      {/* Title overlay */}
      <div style={{
        position: 'absolute',
        bottom: 100,
        width: W,
        textAlign: 'center',
        fontFamily: 'Georgia, serif',
      }}>
        <div style={{
          color: '#fff',
          fontSize: 52,
          letterSpacing: 8,
          opacity: 0.9,
          textShadow: `0 0 30px ${primaryColor}44`,
        }}>
          AURORA
        </div>
        <div style={{
          color: primaryColor,
          fontSize: 18,
          letterSpacing: 12,
          marginTop: 12,
          opacity: 0.6,
        }}>
          BOREALIS
        </div>
      </div>
    </AbsoluteFill>
  );
};
