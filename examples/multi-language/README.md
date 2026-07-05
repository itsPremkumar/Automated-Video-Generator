# Multi-Language Example

Generate the same script in multiple languages — English, Tamil, Hindi, Spanish, French, and German.

## Purpose

Demonstrates how to create localized versions of the same video content for different language audiences, using Edge-TTS's 400+ voice support.

## Expected Output

6 separate MP4 files, one per language, all with the same visual content but different voiceovers matching the target language.

## Usage

```bash
# From the project root
cp examples/multi-language/input-scripts.json input/
npm run generate
# Output: output/multi-lang-en/, output/multi-lang-ta/, ...
```

## Supported Languages

Edge-TTS supports 400+ voices across 13+ languages. Set the `language` field to any supported locale (e.g., `ta` for Tamil, `hi` for Hindi, `es` for Spanish).
