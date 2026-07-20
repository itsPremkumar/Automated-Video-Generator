# 🎬 Automated-Video-Generator — Improvement Assessment

> Verified live: working tree clean, `npm audit --omit=dev` = **0 vulnerabilities**, 75 test files,
> `youtube-upload/` module present (committed). This is the snapshot as of the latest session.

## ✅ What's already solid (no change needed)
- **MCP server** (60 tools / 9 resources / 4 prompts) — agent-driveable, unique advantage
- **0 vulnerabilities**, prettier-clean, typecheck-clean, 487+ unit tests across 75 files
- **Local-first, free**: Remotion + Edge-TTS + Openverse/Pexels, no GPU, no API keys
- **YouTube adapter** present (`youtube-upload/`) — dry-run verified
- **Multi-platform**: CLI, HTTP, Electron, MCP

## 🔴 Genuine gaps (real improvements)

### 1. No AI-generated footage (only stock stitching)
The tool stitches stock clips + TTS. It cannot **create new visuals from a prompt**.
- **Fix:** Add a `CogVideoX` / `Qwen-Omni` module as a "generate B-roll" tool.
  When stock search fails, generate the shot locally. Listed in `ai-company/departments/06-ai-ml.md`
  and `18-video-generation.md` as the companion.
- **Impact:** High — unlocks "any visual from text", not just what stock libraries have.

### 2. No talking-head / avatar mode
No AI presenter (HeyGen-style). Videos are faceless narrated slides.
- **Fix:** Add `sadtalker` / `wav2lip` as an "avatar presenter" mode (drive a portrait with TTS audio).
- **Impact:** Medium-High — opens "AI spokesperson" use cases, higher engagement.

### 3. No real-render E2E test (partially addressed)
An E2E render test now exists at `src/render.e2e.test.ts` (run via `npm run test:render`).
All 487+ tests include unit, integration, and this E2E test. The remaining gap is CI gating
for GPU/Chromium-heavy renders.

### 4. No visual/timeline editor
It's script-driven (JSON in → video out). No drag-drop timeline (unlike `clip-js`).
- **Fix:** Optional — add a lightweight Remotion Studio / clip-js-style editor later.
- **Impact:** Low for faceless automation; nice-to-have for power users.

### 5. YouTube upload needs live credentials (blocked)
The adapter is built and dry-run verified, but real upload needs YOUR Google OAuth client-id/secret.
- **Fix:** Create Google Cloud OAuth creds (you've struggled with this before — I can give
  step-by-step or a no-credential path via the adapter's mock mode).
- **Impact:** Unblocks the "publish" step of the autonomous loop.

## 📋 Prioritized plan
| Priority | Improvement | Effort | Value |
|---|---|---|---|
| P0 | Real-render E2E test (CI gating) | Low | Confidence the product actually works |
| P1 | CogVideoX B-roll module | Med | True AI video generation |
| P1 | YouTube live upload (OAuth) | Med | Closes publish loop |
| P2 | sadtalker avatar mode | Med | AI presenter videos |
| P3 | Visual editor | High | Power-user UX |

## Bottom line
The project is **production-clean and uniquely MCP-ready** — a strong Product #1 for the AI company.
The only *functional* limits are: it stitches stock (no generative footage), and has no avatar.
All are additive, non-breaking improvements.

See `ai-company/departments/18-video-generation.md` + `06-ai-ml.md` for the open-source companions.
