# Batch Processing Example

Generate multiple videos in a single run — ideal for content calendars and bulk production.

## Purpose

Shows how to configure multiple video jobs in one `input-scripts.json` file, each with different scripts, orientations, and languages.

## Expected Output

Multiple complete MP4 videos, each with unique script, visuals, and voiceover — all generated with one command.

## Usage

```bash
# From the project root
cp examples/batch-processing/input-scripts.json input/
npm run generate
# Output: output/batch-demo-1/, output/batch-demo-2/, ...
```

## Advanced Use

- Mix portrait and landscape orientations in one batch
- Use different languages per video
- Combine with cron for daily automated publishing
