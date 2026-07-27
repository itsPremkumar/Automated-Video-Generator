import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { THEME } from '../lib/theme';

const LINES = [
  { t: '$ npm run deploy', c: THEME.text },
  { t: '› Building production bundle...', c: THEME.muted },
  { t: '✓ Compiled 248 modules in 3.2s', c: '#34d399' },
  { t: '› Optimizing assets...', c: THEME.muted },
  { t: '✓ Assets optimized (1.4 MB → 412 KB)', c: '#34d399' },
  { t: '› Uploading to edge network...', c: THEME.muted },
  { t: '✓ Deployed to 3 regions', c: '#34d399' },
  { t: '🚀 Live at https://app.example.com', c: THEME.accent2 },
];

const CPS = 2.2; // chars per frame

export const TerminalTyping: React.FC = () => {
  const frame = useCurrentFrame();

  // figure out how many total chars typed so far, line by line
  let budget = frame * CPS;
  const rendered: { t: string; c: string; done: boolean }[] = [];
  for (const line of LINES) {
    if (budget <= 0) break;
    const shown = Math.min(line.t.length, Math.floor(budget));
    rendered.push({ t: line.t.slice(0, shown), c: line.c, done: shown >= line.t.length });
    budget -= line.t.length + 6; // gap between lines
  }
  const cursorOn = Math.floor(frame / 15) % 2 === 0;

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.bg, padding: 0, justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          width: 1500,
          height: 820,
          backgroundColor: '#0d1117',
          borderRadius: 18,
          boxShadow: `0 40px 120px #000a, 0 0 0 1px ${THEME.muted}22`,
          overflow: 'hidden',
          fontFamily: THEME.mono,
        }}
      >
        {/* title bar */}
        <div style={{ height: 56, background: '#161b22', display: 'flex', alignItems: 'center', paddingLeft: 24, gap: 12 }}>
          {['#ff5f56', '#ffbd2e', '#27c93f'].map((c) => (
            <div key={c} style={{ width: 16, height: 16, borderRadius: '50%', background: c }} />
          ))}
          <span style={{ color: THEME.muted, fontSize: 22, marginLeft: 20 }}>bash — deploy</span>
        </div>
        {/* body */}
        <div style={{ padding: 40, fontSize: 34, lineHeight: 1.7 }}>
          {rendered.map((l, i) => (
            <div key={i} style={{ color: l.c, whiteSpace: 'pre' }}>
              {l.t}
              {i === rendered.length - 1 && !l.done && cursorOn ? '▋' : ''}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
