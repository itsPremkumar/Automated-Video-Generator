# Agentic Video Generation — Production Guide (for Agents)

This guide explains how an **agent** (or any automated driver) produces real,
renderable videos with the Automated-Video-Generator agentic pipeline, and how
to run the verified 10-video hardening sweep.

## 1. The driver-first model (no LLM keys required)

The pipeline separates **creative direction** (the script) from **rendering**.
An agent supplies the script via `req.agent.writeScript`; the pipeline renders
it offline using free sources (Openverse / Wikimedia / Internet Archive) and
local placeholder cards. No Pexels / OpenRouter / Ollama keys are needed.

```ts
import { runAgenticPipeline, renderAgenticSlideshow } from './src/agentic/orchestrate.js';

const req = {
  jobId: 'agent_' + Date.now(),
  topic: '5 benefits of drinking water daily',
  title: 'Stay Hydrated',
  backend: 'agent',            // offline, heuristic-free when script is injected
  orientation: 'portrait',     // or 'landscape'
  preferVisual: 'image',       // images -> scene length = scripted ~8s (NOT fetched-clip length)
  agent: {
    // DRIVER-FIRST: the agent's own script. One scene per blank-line block.
    // Put the visual cue on the SAME line inside [brackets].
    writeScript: async () => `Water makes up 60 percent of your body. [glass of water]

A single glass sharpens focus within minutes. [glass of water]

Hydration supports concentration and clearer memory. [person stretching]`,
  },
};

const res = await runAgenticPipeline(req, (p) => console.log(p.stage, p.percent));
if (!res.gate.pass) throw new Error('gate: ' + res.gate.reasons.join('; '));

const out = await renderAgenticSlideshow(res, {
  preset: 'cinematic',          // cinematic | vibrant | minimal
  captionTheme: 'minimal-white',// see CAPTION_THEME_PRESETS in src/agentic/config.ts
  intro: { title: 'Stay Hydrated', subtitle: '60 second reset', durationSec: 2.5 },
  outro: { ctaText: 'Subscribe', showSubscribe: true, hashtags: ['#health'], durationSec: 3 },
  kenBurns: true,
});
// out -> <workspace>/render/<jobId>.mp4  (verified: 720x1280 or 1280x720, h264+aac)
```

### Script format rules (learned the hard way)
- **One scene per blank-line-separated block.**
- **Visual cue goes on the SAME line** as the sentence: `Text here. [keyword for image search]`.
  A cue on its own line is parsed as a *separate* scene.
- **Use `preferVisual: 'image'`.** If you let it fetch video clips, the render uses each
  clip's *real* length (can be 20–30s) and your 30–60s video balloons to minutes.
- Scene count → duration: ~6–8 short scenes ≈ 30–50s. The gate rejects `total > 60s`.

## 2. Verified 10-video hardening sweep

`bin/batch-10.ts` generates 10 videos across varieties and **verifies each output
with ffprobe** (video+audio streams, duration, dimensions). It is the regression
net for the render path.

```bash
npm run batch:hardening      # tsx bin/batch-10.ts
```

The matrix (all 10 verified passing on Windows / Node 22 / ffmpeg-static):
portrait & landscape; presets cinematic/vibrant/minimal; caption themes
minimal-white & bold-yellow; intro+outro on 5; kenBurns on 4.

## 3. Known constraints (production honesty)
- **No API keys → tones, not speech.** Voiceover falls back to a soft sine tone
  (the video is still watchable with burned captions). To get real narration,
  set `VOICEBOX_PROFILE_ID` to a real profile (see VOICE_CLONING_GUIDE.md) or
  `OPENROUTER_API_KEY` for the agent brain. The repo `.env` ships a *placeholder*
  profile id — it is treated as "not configured" and fails fast to tones.
- **Voicebox is opt-in.** A placeholder `VOICEBOX_PROFILE_ID` no longer triggers a
  40s spawn + retry storm per scene (fixed). A real id spawns the backend lazily.
- **Windows arg-length limit.** Caption burn now merges word-level cues into
  line-level `drawtext` filters and renders per-scene (segmented path by default),
  so the single `-filter_complex` argument never exceeds the ~8KB Windows spawn
  limit (`spawn ENAMETOOLONG` is fixed).
- **Free footage can 403.** Some Openverse/Wikimedia URLs 403 at download time;
  the pipeline substitutes a local placeholder card automatically — the render
  still succeeds.

## 4. Exit / verification contract
`renderAgenticSlideshow` returns the MP4 path. The pipeline also runs post-render
checks X7–X15 (valid file, duration matches plan, audio present, no long black
frames, no frozen frames, loudness in range, no clipping, valid dimensions,
web-compatible codec). A video that passes these is safe to publish.
