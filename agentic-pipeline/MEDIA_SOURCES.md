# Media Sources — Full Audit (images / videos / audio)

Every working media-acquisition path in this codebase, where it lives, and
whether the **agentic pipeline** uses it. All sources are **free** (no paid API).
Some need a free key (Pexels/Pixabay); most need nothing.

## Images & Videos

| Source | Type | Free key? | Wired in agentic? | Code |
|---|---|---|---|---|
| Pexels | img + vid | ✅ free key | ✅ primary | `src/lib/visual-fetcher.ts` `searchImages` / `searchVideos` |
| Pixabay | video | ✅ free key | ✅ via ladder | `searchPixabayVideos` |
| Openverse | image | ❌ | ⚠️ available but often 502 offline | `openverse-fetcher.ts` |
| Wikimedia Commons | video | ❌ | ✅ via ladder | `free-video/wikimedia.ts` `wikiProvider` |
| Internet Archive | video + audio | ❌ | ✅ via ladder | `free-video/archive.ts` `archiveProvider` |

The agentic `fetchVisual` (`src/agentic/orchestrate.ts`) calls the legacy
`fetchVisualsForScene`, which walks the **entire ladder**:
`Pexels → Pixabay → Wikimedia → Internet Archive → Openverse`.

The per-scene diversity pool (`getImagePool`) now merges results from BOTH
`searchImages` (Pexels) AND `fetchVisualsForScene` (all the rest), dedupes by
URL, and rejects dead hosts (flickr/staticflickr). So the agentic system pulls
distinct media from **every working source**, not just Pexels.

## Audio (background music)

| Source | Type | Free key? | Wired in agentic? | Code |
|---|---|---|---|---|
| OpenLofi | music | ❌ | ✅ (404s offline) | `src/lib/free-music.ts` `OpenLofiProvider` |
| Internet Archive | music | ❌ | ✅ (404s offline) | `InternetArchiveProvider` |
| Local free folder | music | ❌ | ✅ | `LocalFreeProvider` (`input/free-music/`) |

Music is resolved via `resolveFreeBackgroundMusic` → these providers.

## Local assets (user's own media)

- `input/input-assets/` — photos/videos bound per scene via `--local-assets`
  (P1a). Resolved with `inputAssetPath` from `src/lib/path-safety.ts`.
- `input/input-assets/default.jpg` / `default.mp4` — last-resort fallback
  visual (P1b).

## Notes for a new agent

- To force a specific provider, set `OPENVERSE_ENABLED`, `PEXELS_API_KEY`,
  `PIXABAY_API_KEY` in `.env`. The ladder auto-skips providers that error.
- Offline on this box: Pexels works (rate-limited), Wikimedia/Archive reachable
  but sparse, Openverse 502s, free-music 404s → use `--no-sfx` for deterministic
  runs. When online, all sources are live.
- Attribution: every fetched asset carries a `source` + `license` field
  (normalizeLicense) so the final gate (X6) can flag unknown attribution.
