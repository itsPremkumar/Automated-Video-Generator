# Agent Tools & Implementation Phases

Build phases for the agentic pipeline. Each phase ships with **unit tests** and a
**CI check** (typecheck + test) to match the project's production-quality bar.

---

## 1. MCP tool surface (the agent's hands)

New tools in `src/adapters/mcp/register-agentic-tools.ts`, registered by `mcp-server.ts`:

| Tool | Purpose | Returns |
|---|---|---|
| `agentic_plan` | script (or job id) → `plan.json` shot list | plan summary |
| `agentic_acquire` | download candidates into `assets/<type>/<scene>/` | list of downloaded paths |
| `agentic_verify_all` | run full verification matrix → `verification/*.json` | pass/fail per asset |
| `list_pending_assets` | assets needing a decision | table of candidates + scores |
| `get_asset_preview` | base64 thumb / frame for an asset | image data (agent "sees" it) |
| `approve_asset` | ACCEPT an asset | updated manifest |
| `reject_asset` | REJECT + reason → triggers re-fetch | updated manifest |
| `replace_asset` | re-fetch with new keywords | new candidates |
| `edit_asset` | crop / trim / adjust (ffmpeg) | edited path |
| `regenerate_scene` | re-run one scene's plan+acquire+verify | new candidates |
| `agentic_gate` | run final cross-checks (X1–X6) | gate pass/fail |
| `agentic_render` | render only approved assets via Remotion | job id + output path |

Plus reused existing tools: `write_input_script`, `list_voices`, `search_free_video`,
`upload_asset`, `get_video_status`, `list_output_videos`.

Autonomy (`AGENT_AUTONOMY`): at L2 the agent calls approve/reject itself and logs
rationale; at L0/L1 those same tools surface to a human for confirmation.

---

## 2. Phased build

### Phase 1 — Planning engine
- `src/agentic/plan.ts`: parse script → `plan.json` (scenes, per-scene visual intent
  image|video, `searchKeywords`, `musicQuery`, captions, voice, orientation).
- Reuse `src/lib/script-parser.ts` for scene splitting.
- **Tests:** plan from sample `input/input-scripts.json` → valid `plan.json`.
- **CI:** typecheck + `test:unit`.

### Phase 2 — Acquisition into per-type folders
- `src/agentic/acquire.ts`: for each planned asset, download N candidates (default 2)
  into `assets/images/<scene>/`, `assets/videos/<scene>/`, `assets/music/`.
- Reuse `free-image-search/`, `free-video-gen-lab/`, `video-downloader/`, `free-music.ts`.
- **Tests:** mock fetchers → correct folder layout, name scheme.
- **CI:** typecheck + `test:unit`.

### Phase 3 — Verification (images + video + music)
- Extend `verifyMedia` prompt: watermark / text / NSFW / safety.
- `src/lib/music-verifier.ts`: `verifyMusic()` (M1–M5).
- `src/agentic/verify.ts`: runs A/B/C matrices → `verification/*.json`.
- **Tests:** feed a known-good and known-bad image/video/mp3; assert pass/fail.
- **CI:** typecheck + `test:unit`.

### Phase 4 — Decision gateway + editing
- `src/agentic/gateway.ts`: loop acquire→verify→decide; retry ≤3; fallback `defaultVideo`.
- `src/agentic/edit.ts`: crop/trim/adjust via `ffmpeg-static`; `regenerate_scene`.
- Writes `approval-manifest.json`.
- **Tests:** simulate reject→replace→approve cycle; assert manifest correctness.
- **CI:** typecheck + `test:unit`.

### Phase 5 — Final gate + render integration
- `src/agentic/gate.ts`: X1–X6 cross-checks; blocks render on any fail.
- `src/agentic/render.ts`: feed only APPROVED assets to existing Remotion path
  (`src/video-generator.ts`), writing `render-manifest.json`.
- Wire `verifyMedia` into the **image** branch of `video-generator.ts`.
- **Tests:** e2e with a tiny sample script → asserts approved-only render + gate log.
- **CI:** typecheck + `test:unit` + `test:render` (bounded, skip on low-RAM runners).

### Phase 6 — Agent docs + OpenClaw skill
- `skills/agentic-video/SKILL.md`: how an agent drives the 6 stages.
- Update `openclaw.plugin.json` to register the new tools + skill.
- Update `README.md` + `llms.txt` with the agentic workflow.
- **CI:** `format:check` + `lint`.

---

## 3. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Low RAM on build host | bounded tests; `test:render` skipped on low-mem CI |
| Vision provider down (Ollama/Gemini) | `verifyMedia` already degrades gracefully (passes w/ note); gateway logs |
| Re-fetch loop never converges | hard cap of 3 retries → fallback `defaultVideo` |
| Long agent runs | `job-cancellation.ts` already exists; reuse for cancel |
| Music mood mismatch | M5 optional + soft-fail; never blocks render alone |

---

## 4. Definition of done

- All 6 stages runnable by an agent via MCP with **zero human prompts** at L2.
- Every image, video, and music track is vision/signal-verified before render.
- `approval-manifest.json` + `render-manifest.json` give full audit trail.
- `npm test` green (typecheck + unit + render e2e on capable runners).
- Docs + OpenClaw skill updated.
