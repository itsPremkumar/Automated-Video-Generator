# Operations Layer — Single-Task Video Editing

The agentic system can now do **one specific thing** when asked, instead of
always generating a full video. A normal user (or the AI agent) types a plain
request and the system runs **only** that task, reusing the matching slice of
the project (no paid API keys — ffmpeg-static + Edge-TTS + free fetchers).

## How to use it

Two ways to drive it:

1. **Natural-language router** (`do_task` MCP tool, or the agent): type what
   you want in plain English. It classifies the request and runs the single
   matching task. Examples:
   - "merge a.mp4 and b.mp4"
   - "trim this from 10 to 20 seconds"
   - "crop to 9:16 for tiktok"
   - "extract audio from my video"
   - "make a voiceover of welcome to my channel"
   - "split this into 3 parts"
   - "add captions to my video"
   - "add music to my clip"
   - "translate to spanish"
   - "apply cinematic grade"
   - "slow motion this clip"
   - "add watermark MyBrand"
   - "make a square version"
   - **Chains**: "crop to 9:16 then add music" runs two tasks in sequence
     (each step's output feeds the next).

2. **Granular MCP tools** (for power users / agents): each task is also a
   discrete tool — `merge_videos`, `trim_video`, `crop_video`, `resize_video`,
   `rotate_video`, `separate_audio`, `split_video`, `add_captions`,
   `add_music`, `add_audio_track`, `localize_video`, `grade_video`,
   `slow_motion`, `speed_ramp`, `add_watermark`, `add_lower_third`,
   `add_progress_bar`, `derive_outputs`, `make_voiceover`, `download_image`,
   `download_video`, `convert_video`, `to_gif`, `convert_audio`,
   `images_to_video`, `video_to_images`, `social_download`, `separate_video`,
   `mute_video`, `write_script`.

## Available single tasks

| Task | What it does | Reuses |
|------|--------------|--------|
| `merge` | Concatenate 2+ videos | ffmpeg concat |
| `trim` | Cut to [start,end] | ffmpeg |
| `crop` | Crop to 9:16 / 16:9 / 1:1 | ffmpeg |
| `resize` | Scale to WxH | ffmpeg |
| `rotate` | Rotate 90/180/270 | ffmpeg |
| `extract_audio` | Pull audio as mp3 | ffmpeg |
| `split` | Split into N parts / at marks | ffmpeg segment |
| `add_captions` | Burn captions (text or .srt) | ffmpeg drawtext + SRT util |
| `add_music` | Add free CC music (auto-ducked) | resolveFreeBackgroundMusic + applyAutoDucking |
| `add_audio_track` | Mux a user audio file | ffmpeg |
| `localize` | Translated subtitle sidecars | localizeSrtSidecars (free-model, offline-safe) |
| `grade` | Cinematic color grade presets | ffmpeg eq/colorbalance |
| `slow_motion` / `speed_ramp` | Time remap | ffmpeg setpts |
| `watermark` / `lower_third` / `progress_bar` | Overlays | ffmpeg drawtext/drawbox |
| `derive` | Multi-aspect + thumbnail from a file | ffmpeg |
| `voiceover` | Text -> mp3 (Edge-TTS) | generateVoiceovers |
| `download_image` / `download_video` | Free CC media by keyword | fetchVisualsForScene |
| `convert` | Re-container / re-encode (mp4/webm/mov/mkv/avi/m4v) | ffmpeg |
| `to_gif` | Export clip as animated GIF | ffmpeg palettegen |
| `convert_audio` | Convert audio to mp3/wav/ogg/m4a | ffmpeg |
| `images_to_video` | Slideshow from images (Ken-Burns) | ffmpeg loop/zoompan |
| `video_to_images` | Extract frames as PNGs | ffmpeg fps filter |
| `social_download` | Download from YouTube/TikTok/IG (free, yt-dlp) | SocialDownloadAppService |
| `separate_audio` | Extract audio stream to file | ffmpeg |
| `separate_video` | Extract silent video stream | ffmpeg |
| `mute_video` | Remove audio from video | ffmpeg -an |
| `write_script` | Write a video script from a topic (FREE, no key) | writeScriptHeuristic (+optional Ollama) |
| `full_video` | End-to-end generation (the ONLY path that touches the full pipeline) | runAgenticPipeline |

## Quality gate

Every single-task result that produces a video is verified with the same
post-render check the full pipeline uses (`verifyRenderedVideo`) — a broken
merge/trim/crop is caught and reported, not silently shipped.

## Files

- `src/agentic/operations/edit.ts` — merge/trim/crop/resize/rotate/extract-audio
- `src/agentic/operations/split.ts` — split
- `src/agentic/operations/captions.ts` — add_captions
- `src/agentic/operations/audio-track.ts` — add_music / add_audio_track
- `src/agentic/operations/localize.ts` — localize
- `src/agentic/operations/grade.ts` — grade
- `src/agentic/operations/motion.ts` — slow_motion / speed_ramp
- `src/agentic/operations/overlay.ts` — watermark / lower-third / progress-bar
- `src/agentic/operations/derivative.ts` — derive (multi-aspect + thumbnail)
- `src/agentic/operations/voiceover.ts`, `download-media.ts` — voiceover / download
- `src/agentic/operations/route.ts` — intent router (heuristic, no paid key)
- `src/agentic/operations/dispatch.ts` — runs single task or chain + quality gate
- `src/adapters/mcp/register-operations-tools.ts` — MCP tool wiring
