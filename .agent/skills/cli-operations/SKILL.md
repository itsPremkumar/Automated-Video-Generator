---
name: Video Generator CLI
description: Guide for running the Video Generator CLI commands.
version: 1.1.2
metadata:
  requires:
    bins:
      - node
      - npm
      - ffmpeg
      - python
    env:
      - PEXELS_API_KEY
---

# Video Generator CLI Operations Skill

This skill explains the different terminal commands available to run, resume, or fix video generations.

## 1. Standard Generation Commands

These commands are used for a "Fresh Start." They clean up old temporary files to prevent conflicts.

### `npm run generate` (or `npm run build`)
- **What it does:**
  1. Wipes the `.video-cache.json` file.
  2. Cleans the `public/videos` and `public/audio` folders.
  3. Parses your script from `input/input-scripts.json`.
  4. Downloads new stock footage and generates voiceovers.
  5. Renders the video scene-by-scene (Segmented Mode).
- **When to use:** When you have a new script or want to see fresh visuals for an existing script.

---

## 2. Advanced Recovery Commands

These commands save time by reusing already-completed work.

### `npm run resume`
- **What it does:**
  1. **Preserves** everything in `public/` and the `.video-cache.json`.
  2. Only downloads visuals/audio that are **missing**.
  3. Only renders segments that **don't exist yet** in the output folder.
  4. Automatically stitches everything together at the end.
- **When to use:** If your computer crashed, or you lost internet during a long generation. It will pick up exactly where it left off.

### `npm run segment`
- **What it does:**
  1. Skips **ALL** asset fetching and generation.
  2. Jumps directly to "Phase 7: Assembly."
  3. Takes the existing `.mp4` segments in your output folder and merges them.
- **When to use:** Use this if the video was rendered successfully but the final "stitching" failed or if you want to manually re-assemble the segments.

---

## 3. Developer / Debugging Tools

### `npm run dev`
- **What it does:** Starts the local asset server.
- **When to use:** Only needed if you are manually debugging the Remotion components in the browser.

---

## 4. Operational Summary

| Command | Action | Fresh/Resume |
| :--- | :--- | :--- |
| `npm run generate` | Full Process | **Fresh** (Wipes old data) |
| `npm run build` | Full Process | **Fresh** (Alias for generate) |
| `npm run resume` | Skip Existing | **Resume** (Saves time) |
| `npm run segment` | Assembly Only | **Fix** (Stitching only) |

---

## 5. Configuration (JSON Script)

When editing `input/input-scripts.json`, agents can use these newer properties:

| Property | Type | Description |
| :--- | :--- | :--- |
| `showText` | Boolean | Set to `false` to disable on-screen subtitles. |
| `defaultVideo` | String | Filename in `input/input-assests/` to use as a visual fallback. |
| `orientation` | String | `portrait` or `landscape`. |
| `voice` | String | AI voice ID (e.g., `en-US-JennyNeural`). |
