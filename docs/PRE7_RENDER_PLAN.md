# PRE-7 Render Plan (resumed)

## Status
- pre7-space-facts     -> DONE (valid MP4, 16.2s, 1080x1350, h264+aac)
- pre7-ocean-mystery   -> DONE (valid MP4, 26.3s, 1080x1350, h264+aac)
- pre7-productivity-tip -> RENDERING (launched this heartbeat, single-job)

## Config (proven for the 2 finished videos)
- portrait (9:16, 1080x1350); voices GuyNeural/AriaNeural/JennyNeural
- edge-tts (python 3.11, edge_tts 7.2.7); [Visual: default.mp4] per scene -> local asset, no slow Openverse
- MEDIA_VERIFICATION_ENABLED=false; no Pexels/Gemini keys -> rule-based split, no LLM
- REMOTION_BROWSER_EXECUTABLE pinned to native Chrome (no Chromium download)
- REMOTION_TMPDIR project-local (avoids spaces in C:\Users\PREM KUMAR)

## On success
verify MP4 via ffprobe, then mark issue done with publish instructions.
