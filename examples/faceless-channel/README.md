# Faceless YouTube Channel Example

Complete workflow for running a faceless YouTube channel using Automated Video Generator.

## Purpose

Demonstrates how to create a branded video series with consistent intro/outro, style, and voice across multiple episodes — without showing your face or recording audio.

## Expected Output

A branded video with consistent styling, background music, and professional AI voiceover, ready for YouTube publishing.

## Usage

```bash
# From the project root
cp examples/faceless-channel/input-scripts.json input/
npm run generate
# Output: output/faceless-channel-episode-1/final.mp4
```

## Customization

- Edit the script topics in `input-scripts.json`
- Adjust voice, language, and orientation settings
- Add `[Visual: ...]` tags for exact visual control per scene
