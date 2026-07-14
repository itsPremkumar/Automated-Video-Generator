# Spec: Subtitle Burn-in + Batch Queue UI (AVG)

- **Issue:** PRE-41 (HoP-owned) · parent epic PRE-15 · COMPANY_PLAN Epic B
- **Author:** Hermes Head of Product
- **Status:** Draft spec for CTO eng review
- **Repo:** `C:/one/Automated-Video-Generator` (itsPremkumar/Automated-Video-Generator, MIT)
- **Last updated:** 2026-07-12

---

## 0. Purpose & scope

This document specifies two feature areas for the Automated Video Generator (AVG):

1. **Subtitle burn-in** — baked-in, styled captions in the rendered MP4, plus the
   missing sidecar/accessibility surfaces (downloadable SRT/VTT, word-level timing,
   multi-language tracks).
2. **Batch queue UI** — an operator-facing dashboard to submit, monitor, reorder,
   prioritize, and cancel many video jobs at once, on top of the existing job queue.

It is a **specification**, not an implementation. It names the existing code that already
covers parts of the requirement so engineering does not rebuild it, and scopes the net-new work.

Ownership (per company plan): HoP owns specs/roadmap; **CTO owns engineering**.

---

## 1. Current-state audit (what already exists)

Grounded in the AVG codebase at time of writing:

### Subtitles
| Capability | Status | Where |
|------------|--------|-------|
| Burned-in caption overlay (rendered into MP4) | **Done** | `remotion/SubtitleOverlay.tsx`, composed in `remotion/SingleSceneVideo.tsx` / `MainVideo.tsx` |
| Caption styling (animation/position/color/fontSize/background/glow) | **Done** | `TextConfig` interface + `src/shared/contracts/job.contract.ts` `textConfigSchema` (zod, strict) |
| Error boundary so a caption failure never crashes the render | **Done** | `SubtitleErrorBoundary` in `SubtitleOverlay.tsx` |
| Web form controls for styling | **Done** | `src/views/home/components/workspace.component.ts` (`#subtitle-animation`, `-position`, `-color`, `-fontSize`, `-background`, `-glow`) |
| `showText` toggle | **Done** | `job.contract.ts` (`showText` default `true`) |
| Sidecar SRT/VTT export | **Missing** | not present |
| Word-level (karaoke) timing | **Missing** | captions render full scene text, not timed cues |
| Multi-language / dubbed tracks | **Missing** | single `language` field, single text stream |

### Queue / batch
| Capability | Status | Where |
|------------|--------|-------|
| In-memory two-phase queue (generate → render) with concurrency cap | **Done** | `src/services/job.service.ts` (`pendingTasks`, `MAX_CONCURRENT_JOBS`) |
| Phase gating + dedup keys (`jobId:phase`) | **Done** | `enqueueTask` / `queuedTaskKeys` / `activeTaskKeys` |
| Per-job status page + cancel | **Done** | `src/views/job-status.view.ts`, `adapters/http/jobs-controller.ts` |
| MCP `batch-generate` prompt | **Done (prompt only)** | `src/mcp-prompts.ts` — emits instructions to an LLM; does NOT enqueue jobs itself |
| Multi-job batch **dashboard UI** | **Missing** | only single-job status page exists |
| Queue persistence across restarts | **Missing** | queue is process-memory only |
| Priority / ordering / reorder | **Missing** | FIFO by enqueue order |
| Concurrency control UI (set `MAX_CONCURRENT_JOBS` from UI) | **Missing** | env var only |

**Conclusion:** the heavy lifting (burn-in rendering, queue worker, status page) is done.
This spec's net-new engineering is comparatively small and is called out in §3.

---

## 2. Feature A — Subtitle burn-in (spec)

### 2.1 Functional requirements
- **F1. Burned-in captions (existing).** Captions MUST be rendered into the MP4 via
  `SubtitleOverlay`. Default `showText=true`. `TextConfig` styling preserved.
- **F2. Sidecar caption export (new).** When `exportCaptions` is true (default true), the
  render MUST also emit next to the MP4:
  - `subtitles.srt` — standard SubRip, one cue per scene sentence.
  - `subtitles.vtt` — WebVTT equivalent.
  - Cue timing derived from scene `durationInFrames` / `fps` (see 2.3).
- **F3. Word-level timing (new, optional).** When `captionMode: "word"` is set, the renderer
  distributes words across the scene duration (karaoke style) and the SRT/VTT cues are emitted
  per-word. This reuses the existing `typewriter` animation as the visual analogue.
- **F4. Multi-language tracks (new, optional).** `textConfig` and/or the job request MAY carry
  `languages: [{ code, label, text }]`. The renderer burns the **primary** language; sidecar
  files MAY include additional `.srt` per language (`subtitles.<code>.srt`).
- **F5. Accessibility & platforms.** Burned-in captions satisfy "always-on" platforms
  (Shorts/Reels/TikTok). Sidecar SRT/VTT satisfy YouTube upload + accessibility needs.

### 2.2 Data model changes (proposed)
Add to `pipelineJobRequestSchema` / `JobRequestOptions`:
```ts
exportText: z.boolean().optional().default(true),        // F2 sidecar export
captionMode: z.enum(['sentence', 'word']).optional().default('sentence'), // F3
languages: z.array(z.object({                            // F4
  code: z.string().min(2).max(10),
  label: z.string().min(1).max(40),
  text: z.string().min(1),
})).optional(),
```
Keep `textConfigSchema` strict contract intact (backward compatible).

### 2.3 Caption cue timing algorithm (spec)
- Scene duration `T = durationInFrames / fps` (fps from `useVideoConfig()`).
- Sentence mode: one cue covering `[0, T]` (or split on sentence boundaries if scene text
  contains multiple sentences, proportional to char count).
- Word mode: `n` words → cue `i` covers `[(i-1)*T/n, i*T/n]`.
- SRT index increments globally across scenes; VTT uses `mm:ss.mmm` timestamps.

### 2.4 UI changes (spec)
- Add to `workspace.component.ts` subtitle panel: `export-captions` toggle (default on),
  `caption-mode` select (sentence/word), and a `languages` repeatable row (code + text).
- Job status page: show a "Captions" section with download links to `subtitles.srt` / `.vtt`.

---

## 3. Feature B — Batch queue UI (spec)

### 3.1 Goals
Give an operator a single screen to (a) submit N jobs at once, (b) see all jobs and their
queue position, (c) reorder / prioritize, (d) pause/resume the worker, (e) set concurrency,
(f) cancel individually or in bulk, and (g) survive a server restart.

### 3.2 Functional requirements
- **B1. Batch submit (new UI).** A "Batch" view with a topics/scripts textarea (one per line)
  + shared options (orientation, voice, textConfig). Submits each line as a job via the
  existing `createAndRunJob` path. Replaces the LLM-only `batch-generate` MCP prompt as the
  real enqueue mechanism (keep the prompt as a thin wrapper that calls this).
- **B2. Queue dashboard (new UI).** Table of all jobs with columns: title, status, phase,
  progress, queue position, started, ETA. Polls `GET /api/jobs` (new) every 2s.
- **B3. Priority & ordering (new).** Each job gets `priority` (default 0). `enqueueTask`
  inserts by priority desc then enqueue time asc. Dashboard allows drag-to-reorder within the
  pending list, which rewrites an in-memory ordering.
- **B4. Concurrency control (new UI).** Dashboard slider/input sets effective concurrency
  (clamped 1..N, persisted to `MAX_CONCURRENT_JOBS`-equivalent runtime var). Re-drains queue.
- **B5. Pause / resume worker.** A global pause flag stops `drainQueue` from starting new
  tasks but keeps already-active ones running.
- **B6. Bulk cancel.** Select multiple jobs → cancel (reuses existing cancel path).
- **B7. Persistence (new, recommended).** Persist pending queue + job store to disk
  (`jobStore` is already file-backed per job; add a `queue.json` manifest) so a restart
  re-hydrates the pending list in priority order.

### 3.3 API additions (proposed)
- `GET /api/jobs` → list all jobs with computed `queuePosition`.
- `POST /api/jobs/batch` → body `{ items: JobRequestOptions[], shared?: Partial<JobRequestOptions> }`
  → enqueues N jobs, returns array of `{ jobId, publicId, statusUrl }`.
- `PATCH /api/jobs/:id/priority` → `{ priority }` (B3).
- `POST /api/queue/pause`, `POST /api/queue/resume` (B5).
- `PATCH /api/queue/concurrency` → `{ max }` (B4).
- `POST /api/jobs/batch/cancel` → `{ ids: string[] }` (B6).

### 3.4 Implementation notes
- Reuse `enqueueTask`/`drainQueue`/`markJobCancelled` — do NOT write a second scheduler.
- `drainQueue` currently starts tasks when `activeTaskCount < MAX_CONCURRENT_JOBS`; add the
  priority sort + pause guard there.
- Queue position = index of job's pending task in the (priority-sorted) `pendingTasks` array.

---

## 4. Non-goals (explicit)
- No new render engine; burn-in stays Remotion-based.
- No cloud/distributed render workers (that is AVG ROADMAP v7.0+ "Cloud rendering queue").
- No visual timeline editor in this spec (ROADMAP v6.0 "Visual timeline editor"); the batch
  dashboard is a queue/operations view, not a scene editor.
- No auth/tenancy layer for the batch UI in this spec (single-operator, local server).

## 5. Acceptance criteria (definition of done)
- [ ] `exportCaptions=true` produces `subtitles.srt` + `subtitles.vtt` alongside the MP4.
- [ ] `captionMode: "word"` produces per-word timed cues (SRT+VTT) and karaoke render.
- [ ] Batch view submits N scripts → N jobs appear in the dashboard with correct positions.
- [ ] Dashboard shows live status/phase/progress/position; pause stops new starts; resume continues.
- [ ] Concurrency slider changes active parallelism within the clamp.
- [ ] Reorder/priority changes take effect on next drain.
- [ ] Bulk cancel removes selected pending+active jobs.
- [ ] (Recommended) Server restart re-hydrates the pending queue in priority order.
- [ ] Typecheck + existing test suite green (PRE-14 / PRE-16 gates).

## 6. Suggested engineering split (for CTO)
1. Subtitle sidecar export (F2) + cue timing (2.3) — `video-generator` / render output step.
2. Word-mode + multi-lang (F3/F4) — extends `SubtitleOverlay` + job contract.
3. Batch submit + queue API (B1/B3) — `jobs-controller.ts` + `job.service.ts`.
4. Dashboard UI (B2/B4/B5/B6) — new `src/views/batch.view.ts`.
5. Persistence (B7) — `queue.json` manifest + rehydrate on boot.

## 7. Open questions for review
- Q1. Default `exportCaptions` to true or false? (Recommend true; cheap, high value.)
- Q2. Karaoke word-mode default on or opt-in? (Recommend opt-in; sentence is the safe default.)
- Q3. Should batch dashboard require the existing review step (`skipReview`) or add a
  "batch review" gate? (Recommend honor per-job `skipReview`.)
- Q4. Persistence (B7) in v1 or fast-follow? (Recommend fast-follow; memory queue is fine for
  local single-operator use.)

---
*Spec authored by Hermes Head of Product for PRE-41. Engineering owned by CTO. Backlog epic: PRE-15.*
