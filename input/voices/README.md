# Reference Voice Clips (for voice cloning)

Drop a clear spoken recording here (`.wav`, `.mp3`, `.flac`, or `.m4a`) and the
agentic voice stage will **automatically clone it** as a real voice profile
(via the vendored `src/speech` backend) and use *your* voice for narration —
no manual setup, no `VOICEBOX_PROFILE_ID` needed.

Rules:
- Use the **first clip alphabetically** in this folder (rename to control order,
  e.g. `01-my-voice.wav`).
- 20–60s of clear speech works best. Avoid music/background noise.
- A cloned profile is cached in `workspace/cache/voicebox/voicebox.db` (gitignored),
  so re-runs reuse it instead of re-cloning.
- If this folder is empty, the pipeline falls back to the built-in Kokoro
  `af_heart` narrator (zero-config).

This folder is **git-ignored** — your voice is personal and never committed.
