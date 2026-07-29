import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

/**
 * AppUI — mockup of a modern app/web interface.
 * Props: title, panels (number of content cards), accentColor.
 */
export const AppUI: React.FC<{
  title?: string;
  panels?: number;
  accentColor?: string;
  accentColorB?: string;
}> = ({ title = 'App Dashboard', panels = 4, accentColor = '#7c3aed', accentColorB = '#22d3ee' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slide = spring({ frame, fps, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui' }}>
      {/* Browser window */}
      <div style={{
        width: 1400, height: 820, background: '#1e293b', borderRadius: 16, overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        transform: `translateY(${interpolate(slide, [0, 1], [60, 0])})`, opacity: slide,
      }}>
        {/* Title bar */}
        <div style={{ height: 52, background: '#0f172a', display: 'flex', alignItems: 'center', padding: '0 20', borderBottom: '1px solid #334155' }}>
          {['#ef4444', '#f59e0b', '#22c55e'].map((c, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: c, marginRight: 10 }} />
          ))}
          <span style={{ color: '#64748b', fontSize: 14, marginLeft: 20 }}>{title.toLowerCase().replace(/\s+/g, '-')}.app</span>
        </div>
        {/* Content */}
        <div style={{ padding: 40 }}>
          <h1 style={{ color: '#fff', fontSize: 40, fontWeight: 700, marginBottom: 32 }}>{title}</h1>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {Array.from({ length: panels }, (_, i) => {
              const cardDelay = spring({ frame: frame - i * 4, fps, config: { damping: 16 } });
              const w = i === 0 ? '100%' : 'calc(33.33% - 14px)';
              return (
                <div key={i} style={{
                  width: w, minWidth: 280, height: i === 0 ? 160 : 200,
                  background: '#334155', borderRadius: 12, padding: 24,
                  opacity: cardDelay,
                  transform: `scale(${interpolate(cardDelay, [0, 1], [0.95, 1])})`,
                  borderLeft: `4px solid ${i % 2 === 0 ? accentColor : accentColorB}`,
                }}>
                  <div style={{ width: '50%', height: 14, background: accentColor, borderRadius: 4, opacity: 0.6, marginBottom: 12 }} />
                  <div style={{ width: '80%', height: 10, background: '#475569', borderRadius: 4, marginBottom: 8 }} />
                  <div style={{ width: '60%', height: 10, background: '#475569', borderRadius: 4, marginBottom: 8 }} />
                  {i === 0 && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                      {[60, 80, 40].map((w2, j) => (
                        <div key={j} style={{ width: w2, height: 28, background: accentColorB, borderRadius: 6, opacity: 0.4 }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
