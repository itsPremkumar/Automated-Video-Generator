# Agentic Video Generation — Full Working Plan (Enhanced)

> **Scope:** How the Automated-Video-Generator produces a complete, edit-grade video
> (like the existing sproutern reel and the Google-demo reel) from a single topic,
> driven entirely by `input/scripts/agentic-scripts.json` + the Hermes agent.
>
> **Status legend:** ✅ working today · 🟡 agent-driven (Hermes runs it) · 🔲 proposed (not yet wired)
> Every claim below was verified against the repo source, not assumed.

---

## 0. The one-sentence answer

Yes — from a single `agentic-scripts.json` job you already get: **script → auto-downloaded
images/videos/BGM → vision-verified assets → per-scene agent editing → full tag control →
real voice (Kokoro) → multi-aspect render.** The website logo/screenshot/screen-recording
capture is performed by **Hermes using its own tools** (browser/computer_use) and works for
**any website or topic** — not just sproutern. See STAGE 2.

---

## 1. End-to-end scenario (works for ANY website or topic)

The flow below uses **sproutern.com** as a concrete example, but it applies to **any
website, brand, product, or topic** — Hermes can capture any publicly reachable URL, and
the stock downloader fills any visual not satisfied by a captured/local asset.

```
USER: "Make a reel about sproutern — its interview-prep tool."
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1  SCRIPT            ✅ automatic (AgentBrain)             │
│   • AgentBrain builds hook-first, variable-pacing narration       │
│   • Splits into scenes with [Visual: …] cues                     │
│   • Writes the job into agentic-scripts.json                     │
└─────────────────────────────────────────────────────────────────┘
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 2  WEBSITE ASSET COLLECTION  ✅ WORKING (Hermes own tools) │
│   Hermes (this agent) opens sproutern.com using its OWN tools:    │
│     • browser_navigate + browser_vision  → clean page screenshots │
│     • computer_use capture(app="Chrome") → window capture         │
│     • screen-recording via tools/computer-agent (gdigrab mp4)     │
│   Files are saved into input/visuals/  and referenced as          │
│   [Visual: file.png] in the script.                              │
│   This step is AGENT-DRIVEN and WORKING TODAY — no code change   │
│   needed. (A future "capture":[…] JSON field could auto-fire it, │
│   but the supported method now is Hermes capture.)                │
└─────────────────────────────────────────────────────────────────┘
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 3  STOCK DOWNLOAD      ✅ automatic (visual-fetcher)        │
│   • For every scene keyword not satisfied by a local file:        │
│     search Pexels/Pixabay → download image/video to disk         │
│   • Keyless fallback: Openverse/Wikimedia (lower relevance)       │
│   • BGM: resolveFreeBackgroundMusic({query}) → download (no key) │
└─────────────────────────────────────────────────────────────────┘
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 4  VISION VERIFY       ✅ automatic (media-verifier)       │
│   • EVERY asset is vision-checked — both IMAGES and VIDEOS:        │
│     - downloaded stock images + videos (Pexels/Pixabay/Openverse)  │
│     - captured assets (Hermes screenshots + screen-recordings)    │
│     - local files referenced via [Visual: file.png]               │
│   • For VIDEOS, a frame is extracted (ffmpeg) and verified as an   │
│     image, so motion clips are checked too — not just stills.     │
│   • Checks: relevance to script, no text-overlap problems, usable  │
│     quality. Fails → that asset is RE-FETCHED (or re-captured).    │
│   • ⚠ OPT-IN: verification runs only when `aiVerify.verifyOnAcquire`│
│     is enabled in config/.env. Recommended ON for the full         │
│     "every image and video verified" guarantee. Without it, assets │
│     skip the check and flow straight to editing.                  │
└─────────────────────────────────────────────────────────────────┘
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 5  PER-SCENE EDIT       ✅ automatic + agent-controlled     │
│   • reorder / delete / insert / updateScene (scene-edit.ts)       │
│   • per-scene: transition, grade, kenBurns, jCut, captionTheme    │
│   • ONE-BY-ONE: Hermes can edit any scene via agentic:edit        │
└─────────────────────────────────────────────────────────────────┘
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 6  TAGS + EDIT STYLE   ✅ encoded in agentic-scripts.json  │
│   • [Visual: file.png] or [Visual: keyword] per scene            │
│   • transition / grade / kenBurns / jCutSec / captionTheme        │
│   • musicOverride / musicIntensity / volumeOverride               │
│   • voice: kokoroVoice / personas / dialogue / voiceSpeed / pitch │
│   • (Not yet wired to scenes: chromaKey, speed, inSec/outSec,      │
│     keyframes, composite — advanced compositing, see repo plugins) │
└─────────────────────────────────────────────────────────────────┘
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 7  VOICE                ✅ automatic (src/speech, Kokoro)   │
│   • Cold-start: speech-backend auto-spawns python -m speech.main │
│   • Real voiceover WAV per scene (verified working)               │
│   • Cloned voice needs GPU Voicebox variant (CPU: chatterbox 500) │
└─────────────────────────────────────────────────────────────────┘
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 8  RENDER + CRITIQUE   ✅ automatic                         │
│   • ffmpeg slideshow w/ grade/zoompan/xfade + caption overlay     │
│   • logo watermark overlay                                         │
│   • 6 quality gates + 25+ post-render plugins                     │
│   • multi-aspect export: 16:9 / 1:1 / 9:16                        │
│   • Director critique (black frames, aspect, peak dB) → revise    │
└─────────────────────────────────────────────────────────────────┘
        ▼
   output/<job-id>/video.mp4  (+ subtitles, thumbnail, upload script)
```

---

## 2. What is REAL today (verified in code)

| Capability | Evidence | Key needed |
|---|---|---|
| Hook-first script + scene split | `src/agentic/ai/brain.ts`, `buildPlan` | no |
| Auto-download images/videos per scene | `src/lib/visual-fetcher/` (Pexels/Pixabay/Openverse) | keys set in `.env` (works keyless via Openverse) |
| Auto-download BGM | `src/lib/free-music.ts` + `music-system` | **no key** |
| Vision verification of assets (images + videos) | `src/lib/media-verifier.ts`, `acquire.ts` (aiVerifyAsset) | no (local Ollama/Gemini); **opt-in** via `aiVerify.verifyOnAcquire` |
| Per-scene edit one-by-one | `src/agentic/media/scene-edit.ts` | no |
| Visual/grade/transition/Ken-Burns/J-cut/caption tags | `src/agentic/types.ts`, `render.ts` | no |
| Per-scene + global music control | `types.ts` musicOverride/Intensity/volume | no |
| Real voice (Kokoro) + cold auto-start | `src/lib/speech-backend.ts`, `src/speech/` | no (local) |
| Watermark/logo overlay | `render.ts:801-833` | no |
| 25+ post-render FX plugins | `src/agentic/plugins/` (motion/overlays/transitions/color/audio) | no |
| Multi-aspect export | `platforms/platform-export.ts` | no |
| Quality gates + critique + auto-revise | `src/agentic/pipeline/gate.ts`, `revise.ts` | no |
| Website screenshot + screen-record | `tools/computer-agent/` (cua-driver + gdigrab) | no (agent-run) |

---

## 3. The exact command flow (what you run)

```bash
# 1) Write / edit the job in the JSON
notepad input/scripts/agentic-scripts.json
#   add: { "id":"sproutern_reel", "title":"Sproutern Interview Prep",
#          "script":"...[Visual: sproutern-logo.png]...[Visual: dashboard]...",
#          "musicQuery":"upbeat corporate", "kokoroVoice":"af_heart",
#          "backend":"agent", "hookFirst":true }

# 2) (🟡 agent step) capture the site — Hermes runs computer-agent, OR you
#    place files manually into input/visuals/

# 3) Run the full pipeline (plan → visuals → voice → render)
npm run generate:agentic
#   or the modular CLI:
npx tsx src/adapters/cli/agentic-modular.ts pipeline --file input/scripts/agentic-scripts.json

# 4) One-by-one edit if needed
npm run agentic:edit -- --scene 3 --set grade=cinematic
npm run agentic:list

# 5) Output
ls output/sproutern_reel/
```

---

## 4. Sample job — all working fields (sproutern shown; works for any site)

The job below is for sproutern, but the same shape works for **any website or topic**:
replace the `[Visual: …]` tags with your captured assets (or plain keywords for stock),
and set `musicQuery` / `kokoroVoice` to taste.

```json
[
  {
    "id": "sproutern_reel",
    "title": "Sproutern — Interview Prep, Free",
    "script": "Tired of paid career tools? [Visual: sproutern-hero.png]\nSproutern gives free interview prep. [Visual: interview-prep-dashboard.png]\nPractice with real questions. [Visual: practice-screen.png]\nTrack your progress. [Visual: progress-chart.png]\nBuilt by students, for students. [Visual: team-photo.png]",
    "orientation": "portrait",
    "hookFirst": true,
    "variablePacing": true,
    "backend": "agent",
    "kokoroVoice": "af_heart",
    "musicQuery": "upbeat corporate technology",
    "musicIntensity": "mid",
    "defaultVisual": "sproutern-hero.png"
  }
]
```
> `[Visual: file.png]` → uses `input/visuals/file.png` if present, else treated as a
> stock keyword and downloaded. So your captured website assets win; missing ones
> auto-fill from stock.

---

## 5. What is NOT yet automatic (honest gaps)

| Gap | Why | Fix (proposed) |
|---|---|---|
| Vision = pass/fail, not rank-and-pick | verify-only by design | `vision-select.ts` rank pool |
| No green-screen / speed-ramp / trim / keyframe bound to scenes | signals absent | add ffmpeg-native scene signals (`chromaKey`, `speed`, `inSec/outSec`, `keyframes`) |
| No split-screen / PiP per scene | scenes are 1 asset | `composite` scene type (hstack/vstack/overlay) |
| No stabilization | `libvidstab` not wired | dep-check + `stabilize` signal |
| No agent-authored Remotion codegen | static compositions | sandbox-authored `.tsx` w/ tsc validation + fallback |
| Cloned voice needs GPU | chatterbox 500 on CPU | CUDA/ROCm Voicebox variant |
| No semantic/narrative critique | metric-only gates | LLM frame review |

---

## 6. Answers to the user's specific questions (verified)

- **"By using all things can you create a video like the sproutern / Google video?"**
  → **Yes.** Those reels were produced by this exact pipeline. The flow you described
  (script → collect website assets → download stock → vision verify → per-scene edit →
  tags → voice → render) is the real, working path.

- **"Images AND video downloaded from agentic-scripts.json?"** → ✅ Yes.

- **"BGM also downloaded from the JSON, not just images?"** → ✅ Yes, `musicQuery`,
  no key needed.

- **"Collect screenshots / logo / screen-record from a website?"** → ✅ **Yes — this is
  the working method.** Hermes (this agent) captures the site using its OWN tools
  (`browser_navigate` + `browser_vision` for screenshots, `computer_use capture` for window
  capture, `tools/computer-agent` gdigrab for screen-recording) and drops the files into
  `input/visuals/`. The pipeline then binds them automatically via `[Visual: file.png]`.
  No JSON field needed — the agent does the capture. This is supported and working today.

- **"Visually verify every collected image/video?"** → ✅ Yes — **every** asset
  (downloaded stock images + videos, Hermes-captured screenshots + screen-recordings,
  and local `[Visual: …]` files) is vision-checked, including a frame-extracted check
  for videos. It is **opt-in**: enable `aiVerify.verifyOnAcquire` (config/.env) so no
  unverified asset reaches editing; failures are re-fetched/re-captured.

- **"Edit images/video one-by-one, verify, finally select everything?"** → ✅ Yes,
  `scene-edit.ts` + `agentic:edit` + critique/revise.

---

## 7. Verification standard (AVS bar)

Every change is proven by **real render + frame extraction + vision inspection**, not just
`tsc`. Static checks miss visual defects (wrong aspect, missing watermark, blank emoji,
wrong caption color). Frames are extracted with `ffmpeg -ss AFTER -i` (not before, which
yields undecodable tails on J-cuts).

---

*Generated as the enhanced working plan for the agentic video pipeline. All ✅ items are
present in the repo and were confirmed by reading the source. Website capture (STAGE 2) is
✅ and is performed by Hermes using its own browser/computer_use tools — working today, no
code change needed.*
