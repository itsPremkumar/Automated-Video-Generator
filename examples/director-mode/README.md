# Director Mode Example

Use `[Visual: ...]` tags in your script for frame-perfect control over each scene's visuals.

## Purpose

Demonstrates the Director Mode feature, where you specify exact visual descriptions for each scene, overriding automatic media selection.

## Expected Output

A video where each scene's visuals match your exact specifications, combined with AI-generated voiceover.

## Usage

```bash
# From the project root
cp examples/director-mode/input-scripts.json input/
npm run generate
```

## How It Works

Director Mode tags in the script:

```
[Visual: a serene mountain lake at sunset, cinematic, slow pan]
Your narration text here...
[Visual: time-lapse of stars over a desert landscape]
More narration...
```

The pipeline uses these descriptions when fetching stock media instead of auto-extracting keywords.
