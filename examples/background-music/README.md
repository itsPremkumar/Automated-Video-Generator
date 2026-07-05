# Background Music Example

Add background music with automatic volume ducking to keep voiceovers clear.

## Purpose

Demonstrates the background music feature, including configuration for music source, volume, and auto-ducking behavior.

## Expected Output

A video with background music that automatically lowers volume during voice segments and returns to full volume during pauses.

## Usage

```bash
# From the project root
cp examples/background-music/input-scripts.json input/
npm run generate
```

## Configuration

Key environment variables:

```env
BACKGROUND_MUSIC=true
BACKGROUND_MUSIC_VOLUME=0.15
BACKGROUND_MUSIC_DUCKING=0.05
```

Music files go in `input/music/` in supported formats (MP3, WAV, M4A).
