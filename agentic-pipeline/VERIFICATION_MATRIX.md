# Verification Matrix — "verify all the possible things"

Every asset type is checked at two moments:
- **Progressive** — immediately after download (STAGE 3), so bad assets are caught early.
- **Final gate** — holistic cross-checks before render (STAGE 5).

Pass criteria use `VERIFY_PASS` confidence (default **7/10**) for vision checks.

---

## A. IMAGES (per scene)

| # | Check | Method | Reuse / New | Pass criteria | On fail |
|---|---|---|---|---|---|
| I1 | **Relevance** (is this the right subject?) | Vision LLM on the image vs `searchKeywords` | `verifyMedia()` (already supports images) | `passes && confidence ≥ VERIFY_PASS` | reject → re-fetch |
| I2 | **No watermark / no text overlay** | Vision LLM prompt extension | extend `verifyMedia` prompt | no watermark/text detected | reject → re-fetch |
| I3 | **Safe / not NSFW** | Vision LLM safety prompt | extend `verifyMedia` prompt | safe = true | reject + alert |
| I4 | **Min resolution** | read image dims | `sharp` (devDep) / ffprobe | width ≥ 720 (portrait) / ≥1280 (landscape) | reject → re-fetch |
| I5 | **Aspect ratio match** | dims vs orientation | compute | matches 9:16 or 16:9 | crop or reject |
| I6 | **License / attribution** | metadata from source | `openverse-fetcher` fields | has license + url | flag, still usable w/ attribution |
| I7 | **Not a duplicate** | hash vs other scene images | sha256 compare | unique | prefer, allow if intentional |

---

## B. VIDEOS (per scene)

| # | Check | Method | Reuse / New | Pass criteria | On fail |
|---|---|---|---|---|---|
| V1 | **Relevance** | Vision LLM on extracted frame vs keywords | `verifyMedia()` (frame extract exists) | `passes && confidence ≥ VERIFY_PASS` | reject → re-fetch |
| V2 | **No watermark / no text** | Vision LLM on frame | extend `verifyMedia` | clean frame | reject → re-fetch |
| V3 | **Safe / not NSFW** | Vision LLM safety | extend `verifyMedia` | safe = true | reject + alert |
| V4 | **Duration fit** | ffprobe | `getVideoMetadata()` exists | ≥ scene voiceover length (within buffer) | trim or reject |
| V5 | **Min resolution / codec** | ffprobe | `getVideoMetadata()` | width ≥ 720, H.264/HEVC | transcode or reject |
| V6 | **Aspect ratio** | ffprobe dims vs orientation | compute | matches target | crop or reject |
| V7 | **License** | source metadata | `free-video` providers | CC / public domain | flag w/ attribution |

---

## C. BACKGROUND MUSIC

| # | Check | Method | Reuse / New | Pass criteria | On fail |
|---|---|---|---|---|---|
| M1 | **License valid** | parse track.license | `free-music.ts` returns license | CC0 / CC / public domain | reject → next provider |
| M2 | **Duration enough** | ffprobe | `music-verifier.ts` (NEW) | ≥ total video length (loop if shorter ok) | pick longer / loop |
| M3 | **No silence / not corrupt** | ffprobe + silence detect | `music-verifier.ts` (NEW) | < 2s leading/trailing silence, valid frames | reject |
| M4 | **Bitrate / quality** | ffprobe | `music-verifier.ts` (NEW) | ≥ 96 kbps | reject → re-fetch |
| M5 | **Mood match (optional)** | LLM on title/tags vs video mood | LLM call (off by default) | matches `musicQuery` | soft-fail (still usable) |

---

## D. CROSS-CHECKS (final gate, STAGE 5)

| # | Check | Method | Pass criteria |
|---|---|---|---|
| X1 | **TTS duration alignment** | sum scene voiceover ≈ sum asset durations | within 5% |
| X2 | **No missing assets** | every scene has ≥1 approved visual | all present |
| X3 | **No unresolved rejects** | `approval-manifest` has decision for all | 0 pending |
| X4 | **Caption sync** | caption timings within scene bounds | all in-bounds |
| X5 | **Total runtime** | final length within platform limit (Shorts ≤ 60s etc.) | pass |
| X6 | **Attribution completeness** | all CC assets carry license url in manifest | complete |

**Rule:** the final gate blocks render if ANY of X1–X6 fails or any asset lacks an
APPROVED decision. This is the "after all the things must be verified" guarantee.
