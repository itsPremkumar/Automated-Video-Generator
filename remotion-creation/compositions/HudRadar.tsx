import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { THEME, seeded } from '../lib/theme';

const CX = 960;
const CY = 540;
const R = 380;
const HUD = '#22d3ee';

export const HudRadar: React.FC = () => {
  const frame = useCurrentFrame();
  const sweep = (frame * 3) % 360;

  // blips that light up when the sweep passes over them
  const blips = Array.from({ length: 7 }).map((_, i) => {
    const ang = seeded(i) * 360;
    const dist = 80 + seeded(i + 50) * (R - 100);
    const x = CX + Math.cos((ang * Math.PI) / 180) * dist;
    const y = CY + Math.sin((ang * Math.PI) / 180) * dist;
    const diff = ((sweep - ang + 360) % 360);
    const glow = diff < 60 ? interpolate(diff, [0, 60], [1, 0]) : 0;
    return { x, y, glow, i };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#04070d' }}>
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        {/* concentric rings */}
        {[0.3, 0.55, 0.8, 1].map((f, i) => (
          <circle key={i} cx={CX} cy={CY} r={R * f} fill="none" stroke={`${HUD}44`} strokeWidth={2} />
        ))}
        {/* cross hairs */}
        <line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke={`${HUD}33`} strokeWidth={1.5} />
        <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} stroke={`${HUD}33`} strokeWidth={1.5} />

        {/* rotating sweep wedge */}
        <defs>
          <radialGradient id="sweep" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`${HUD}00`} />
            <stop offset="100%" stopColor={`${HUD}66`} />
          </radialGradient>
        </defs>
        <g transform={`rotate(${sweep} ${CX} ${CY})`}>
          <path d={`M ${CX} ${CY} L ${CX + R} ${CY} A ${R} ${R} 0 0 0 ${CX + R * Math.cos(-0.6)} ${CY + R * Math.sin(-0.6)} Z`} fill="url(#sweep)" />
          <line x1={CX} y1={CY} x2={CX + R} y2={CY} stroke={HUD} strokeWidth={3} />
        </g>

        {/* blips */}
        {blips.map(({ x, y, glow, i }) => (
          <circle key={i} cx={x} cy={y} r={6 + glow * 10} fill={THEME.accent3} opacity={0.3 + glow * 0.7}
            style={{ filter: `drop-shadow(0 0 ${glow * 14}px ${THEME.accent3})` }} />
        ))}
      </svg>

      {/* HUD readouts */}
      <div style={{ position: 'absolute', top: 60, left: 80, fontFamily: THEME.mono, color: HUD, fontSize: 32 }}>
        <div>SCAN: ACTIVE</div>
        <div>BEARING: {String(Math.round(sweep)).padStart(3, '0')}°</div>
        <div>CONTACTS: {blips.filter((b) => b.glow > 0.1).length}</div>
      </div>
      <div style={{ position: 'absolute', bottom: 60, right: 80, fontFamily: THEME.mono, color: HUD, fontSize: 28, textAlign: 'right' }}>
        <div>SYS · ONLINE</div>
        <div>GRID · 1920x1080</div>
      </div>
    </AbsoluteFill>
  );
};
