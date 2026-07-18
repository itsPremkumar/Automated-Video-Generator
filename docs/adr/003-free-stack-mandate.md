---
title: ADR 003 — Free-Stack Mandate
status: Accepted
date: 2026-07-18
deciders: Project owner + agentic pipeline contributors
---

# ADR 003: Free-Stack Mandate (zero keys, opt-in bolt-ons)

## Context

The product positioning is **"Free & open-source self-hosted AI text-to-video … No
watermark, no subscriptions, no API key required."** The owner's instruction to the agent
was explicit: *"if this project is controlled by you, the Hermes AI agent, I don't want to
use any other AI models — all the AI work you can do yourself."*

Two forces pulled against this:
1. Stock media and music usually imply API keys (Pexels/Pixabay keys, paid music libs).
2. "AI verification" and "voice cloning" naturally suggest paid vision/LLM services.

The pipeline had to deliver a *watchable, verified* video while defaulting to **$0 and no
keys**, and remain fully functional offline.

## Decision

Adopt a **free-stack mandate** with strict layering:

- **Default path is key-less.** Stock media via Openverse/Pexels/Pixabay/Wikimedia
  (`src/lib/visual-fetcher.ts`), music via `src/lib/free-music.ts` (royalty-free cache +
  bundled fallback track), voiceover via Edge-TTS (`src/lib/voice-generator.ts`) with a
  local sine-tone fallback (`src/agentic/tts.ts`).
- **The agent is the intelligence.** `backend: 'agent'` uses deterministic heuristics
  (`agent.ts` `writeScriptHeuristic`/`expandKeywordsHeuristic`/`agentDecide`) and the
  agent's *own* model (`AgentBrain`) when configured — no external Gemini/Ollama key
  required. With `backend: 'agent'` and no model, the run is fully offline and free.
- **AI verification is opt-in and augment-only.** `src/agentic/ai-verify.ts` reuses the
  agent's own model; it is gated behind `config.aiVerify.*` (default all off). A `null`
  result (no model / offline) is ignored and the **deterministic signal gates decide**. AI
  scores are AND-ed with signal checks, never a replacement.
- **Render uses bundled `ffmpeg-static`.** No Chrome/Remotion needed for the agentic path
  (`renderAgenticSlideshow`), avoiding heavy runtime deps.
- **Vision relevance + Voicebox are bolt-ons**, not requirements (see ADR 002). Off by
  default.

Every network/filesystem dependency is **dependency-injected** so the unit-test suite runs
with fakes and zero network.

## Consequences

**Good:**
- The "no API key" promise is real and testable: `npm run agentic` works on a fresh clone
  with an empty `.env`.
- Offline resilience is structural, not bolted on: placeholder cards, tone audio, cached
  music, and signal gates mean a missing network degrades gracefully instead of failing.
- Cost is $0 to operate; self-hosting needs only Node + the bundled ffmpeg.

**Trade-offs:**
- Default quality is bounded by free sources and heuristics; premium results require the
  opt-in bolt-ons (vision verify, Voicebox) which the user enables knowingly.
- Signal-only verification (when AI verify is off) can't catch semantic mismatch as well as
  a vision model — accepted because it's the free default and the user can opt in.
- More fallback code paths to maintain (`generateFallbackVisual`, `makePlaceholder`,
  `toneForScene`), but each is tiny and isolated.

**Rejected alternative:** requiring API keys or a paid vision/LLM service for the default
path — directly contradicts the product mandate and the owner's instruction.
