// Shared theme + tiny helpers used across all code-only compositions.
export const THEME = {
  bg: '#0a0a14',
  bg2: '#12122a',
  accent: '#7c3aed', // purple
  accent2: '#22d3ee', // cyan
  accent3: '#f472b6', // pink
  text: '#f5f5ff',
  muted: '#9aa0b5',
  font: 'Segoe UI, system-ui, -apple-system, sans-serif',
  mono: 'Consolas, "Courier New", monospace',
};

// Deterministic pseudo-random so renders are stable across frames/machines.
export function seeded(i: number): number {
  const x = Math.sin(i * 127.1 + 43.7) * 43758.5453;
  return x - Math.floor(x);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
