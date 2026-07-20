# Local Assets Example

Use your own images and videos instead of stock media from third-party APIs.

## Purpose

Demonstrates how to reference local media files in your scripts using `[Visual: filename.jpg]` or `[Visual: filename.mp4]` tags.

## Expected Output

A video composed entirely of your own media files, with AI-generated voiceover but no external API calls for visuals.

## Usage

1. Place your media files in `input/visuals/`
2. Reference them in your script with `[Visual: your-file.jpg]`
3. Run the generator

```bash
# From the project root
cp examples/local-assets/input-scripts.json input/scripts/
# Also copy sample assets
cp -r examples/local-assets/assets/* input/visuals/
npm run generate
```

## When to Use

- You have branded visuals or specific images that must appear
- You want full control over visual content
- You're working offline or without API keys
