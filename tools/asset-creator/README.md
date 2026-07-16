# asset-creator — Free Asset Creation Engine

A **completely free, offline, zero-API-key** asset-creation engine built for the
Automated-Video-Generator's agentic pipeline. Every asset is **generated locally**
by `ffmpeg-static` — no network, no downloads, no paid models. This is the
"creation" counterpart to AVG's stock-"download" asset pipeline (`src/agentic/acquire.ts`).

## What it creates (all verified by tests)

| Asset type | Function | Notes |
|---|---|---|
| 🖼️ Background image | `createBackgroundImage` | gradient/branded bg (lavfi `gradients`) |
| 🅰️ Title card | `createTitleCard` | title + subtitle, centered, fontfile-aware |
| 💬 Quote card | `createQuoteCard` | manual word-wrap (no `wrap_width` in static ffmpeg) |
| 🎬 Ken-Burns clip | `createKenBurnsClip` | zoom/pan over a still → mp4 |
| 🎞️ Kinetic text clip | `createKineticTextClip` | fade/scale-in typography |
| ⏱️ Countdown clip | `createCountdownClip` | 3..2..1 intro |
| 🎵 Background music | `createBackgroundMusic` | procedural 2-oscillator pad (root+fifth), lowpassed |
| 💥 SFX | `createSfx` | whoosh / ding / impact / pop / click (aevalsrc synth) |
| 🎞️ GIF | `createGif` | palette-quantized loop from any clip |
| 🚧 Placeholder | `createPlaceholder` | styled branded fallback (AVG "bright placeholder" spirit) |

## Why ffmpeg-only (no node-canvas)
The project's static `ffmpeg-static` build supports `lavfi` sources, `drawtext`
(needs a system `fontfile`), and all audio filters. node-canvas would need a
native compile (unreliable on this box). ffmpeg is already present → zero new deps.

## Gotchas fixed during build (documented so they don't recur)
1. Static ffmpeg has **no `a-lowpass`** → use `lowpass` for audio.
2. `sine` frequency expression **does not support `t`** → use `aevalsrc` for decay envelopes.
3. `drawtext` **requires a `fontfile`** (no bundled font) → `fontFile()` detects `C:\Windows\Fonts\arial.ttf` etc.
4. **`lightgray` is not a valid color** in this build → use `gray`.
5. **`wrap_width` is not supported** → `wrapText()` does manual line breaking with `\n`.

## Usage
```js
const ac = require('./src/index.js');
const img = ac.createTitleCard({ out: 'out/title.png', title: 'Home Workout', subtitle: '5 moves' });
const clip = ac.createKenBurnsClip({ src: img, out: 'out/kb.mp4', duration: 4 });
const bgm = ac.createBackgroundMusic({ out: 'out/bgm.wav', duration: 20 });
```

## Tests (gstack /health gate)
```
npm install
node --test        # 14 pass, 0 fail
```

All 14 tests pass as of 2026-07-16.
