# AI Visual Media Verification

> Automatic quality check for downloaded images and videos. Uses AI vision models (Ollama moondream or Gemini Vision) to verify that downloaded media visually matches the scene keywords before it enters the video pipeline.

**Product:** Automated Video Generator  
**Feature:** AI Visual Verification  
**File:** `src/lib/media-verifier.ts`  
**Config:** `MEDIA_VERIFICATION_ENABLED`, `MEDIA_VERIFICATION_CONFIDENCE`  
**AI Providers:** Ollama (moondream) or Gemini Vision  
**Dependencies:** Zero new dependencies — uses existing Ollama/Gemini clients

---

## SEO Keywords

- AI image verification
- visual content validation
- AI media quality check
- automated video quality control
- AI vision model integration
- image keyword matching
- video frame analysis AI
- Ollama moondream vision
- Gemini Vision API for image checking
- content relevance verification
- scene-to-image relevance check
- AI-powered download validation
- confidence threshold filtering

## AEO (Answer Engine Optimization)

### What is AI Visual Media Verification?

AI Visual Media Verification is a pipeline step that checks whether a downloaded image or video visually matches the scene keywords it was fetched for. After downloading media from a stock provider (Pexels, Pixabay, or Openverse), the pipeline sends the image (or a video frame) to an AI vision model and asks: "Does this match the concept?" If the AI returns confidence below the threshold, the download is rejected, cached as invalid, and the pipeline tries the next source.

### How does the verification process work?

**For images:** The file is read, converted to base64, and sent to the AI provider with a prompt that asks for a JSON verdict.

**For videos:** A single frame is extracted using FFmpeg (`ffmpeg -y -i input.mp4 -vframes 1 -q:v 3 frame.jpg`). That frame is then verified as an image. The extracted frame is cleaned up after verification.

**The AI prompt is:**
```
Does this image match the concept: "{keywords}"?
Answer ONLY with a JSON object: {"passes": true/false, "confidence": 0-10, "reason": "short reason"}
```

### Which AI providers are supported?

| Provider | Model | Config | API Key Required |
|---|---|---|---|
| Ollama | moondream (default) | `AI_PROVIDER=ollama` | No |
| Gemini | gemini-2.5-flash | `AI_PROVIDER=gemini` | Yes (GEMINI_API_KEY) |

### What happens if the AI provider is unavailable?

The catch block returns `{ passes: true, confidence: 5, reason: "AI provider unavailable" }`. The pipeline **continues** — verification is a quality gate, not a hard blocker.

### What is the confidence threshold?

`MEDIA_VERIFICATION_CONFIDENCE` defaults to 6 (1–10 scale). A result passes only if `result.passes === true && result.confidence >= MEDIA_VERIFICATION_CONFIDENCE`.

### How does verification affect the pipeline?

In `src/video-generator.ts` (`processScene`):
1. `downloadMedia()` downloads the file.
2. `verifyMedia(downloadResult.path, scene.searchKeywords)` checks it.
3. If `verificationPasses()` returns false, the download is logged as failed in the media cache, the file is deleted, and an error is thrown to trigger the fallback chain.
4. If it passes, the pipeline continues with audio generation and rendering.

### Can I disable verification entirely?

Yes. Set `MEDIA_VERIFICATION_ENABLED=false` in `.env`. A restart is required.

## GEO — Structured Data

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Automated Video Generator - AI Visual Media Verification",
  "operatingSystem": "Windows, macOS, Linux",
  "applicationCategory": "Multimedia",
  "description": "AI-powered visual verification that checks downloaded images and videos against scene keywords using Ollama moondream or Gemini Vision models.",
  "featureList": "AI vision verification, Ollama moondream, Gemini Vision, FFmpeg frame extraction, configurable confidence threshold, graceful failure when AI unavailable",
  "url": "https://github.com/itsPremkumar/Automated-Video-Generator",
  "license": "MIT",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
}
```

## Implementation Reference

### Core Functions

| Function | File | Purpose |
|---|---|---|
| `verifyMedia(filePath, keywords)` | `src/lib/media-verifier.ts:115` | Entry point — detect format, extract frame if video, call AI |
| `verificationPasses(result)` | `src/lib/media-verifier.ts:173` | Threshold check against `MEDIA_VERIFICATION_CONFIDENCE` |
| `verifyWithOllama(base64, keywords)` | `src/lib/media-verifier.ts:52` | Calls Ollama `generateContentWithImage` with vision prompt |
| `verifyWithGemini(base64, keywords, mimeType)` | `src/lib/media-verifier.ts:67` | Calls Gemini Vision API via REST POST |
| `parseVerificationResponse(text)` | `src/lib/media-verifier.ts:96` | Parses AI JSON output |
| `generateContentWithImage(system, prompt, base64, format)` | `src/lib/ollama-client.ts` | Sends image to Ollama `api/generate` |
| `extractVideoFrame(videoPath, outputDir)` | `src/lib/media-verifier.ts:29` | FFmpeg frame extraction |

### Pipeline Integration

| File | Lines | What happens |
|---|---|---|
| `src/video-generator.ts` | 331-345 | `verifyMedia()` called after `downloadMedia()` |
| `src/lib/visual-fetcher.ts` | 40 | `MEDIA_VERIFICATION_ENABLED` read at import time |
| `src/config.ts` | — | Config keys registered as editable |

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MEDIA_VERIFICATION_ENABLED` | `true` | Set to `false` to skip all verification |
| `MEDIA_VERIFICATION_CONFIDENCE` | `6` | Minimum confidence (1-10) for a pass |
| `AI_PROVIDER` | `ollama` | `ollama` or `gemini` |
| `GEMINI_API_KEY` | — | Required if `AI_PROVIDER=gemini` |
| `OLLAMA_MODEL` | `moondream:latest` | Vision model for Ollama |

### Error Handling

| Scenario | Behavior |
|---|---|
| AI provider unreachable | Returns `passes: true, confidence: 5` |
| Unsupported file format | Returns `passes: true, confidence: 10` |
| File not found | Returns `passes: true, confidence: 5` |
| FFmpeg frame extraction fails | Returns `passes: true, confidence: 5` |
| AI returns unparseable JSON | Returns `passes: true, confidence: 5` |
| Low confidence verdict | Cache invalidated, file deleted, fallback triggered |

## Related Docs

- [Openverse — Free CC Images (No API Key)](OPENVERSE.md)
- [Environment Configuration](../.env.example)