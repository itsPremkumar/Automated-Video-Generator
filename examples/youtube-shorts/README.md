# YouTube Shorts Example

Generate vertical (9:16) videos optimized for YouTube Shorts, TikTok, and Instagram Reels.

## Purpose

Demonstrates the simplest end-to-end workflow: a single script with automatic scene parsing, stock media fetching, AI voiceover, and portrait-mode rendering.

## Expected Output

A 30-60 second portrait-mode MP4 video with voiceover and stock visuals, ready to upload to any short-form video platform.

## Usage

```bash
# From the project root
cp examples/youtube-shorts/input-scripts.json input/
npm run generate
# Output: output/youtube-shorts-demo/final.mp4
```
