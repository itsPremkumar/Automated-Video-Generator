# Agentic Script Format — Quick Reference

> **File**: `input/scripts/agentic-scripts.json`
> **Full docs**: `docs/AGENTIC_SCRIPT_FORMAT.md`

---

## Minimal Job

```json
{
  "id": "my-video",
  "title": "My Video Title",
  "script": "Your script text here.\nEach line is a scene.\n[Visual: keyword] tags control visuals.",
  "orientation": "portrait",
  "voice": "en-US-GuyNeural"
}
```

---

## All Top-Level Fields

| Field | Type | Default | |
| :----- | :--- | :------ | :- |
| `id` | string | auto | Output folder name |
| `title` | **string** | **req.** | Output filename |
| `script` | string | — | Script with `[Visual: ...]` tags |
| `topic` | string | — | Fallback for auto-generation |
| `mode` | string | `"full"` | `plan`, `visuals`, `voice`, `render`, `download-images`, etc. |
| `orientation` | string | `"portrait"` | `portrait`, `landscape`, `square` |
| `aspect` | string | `"9:16"` | `9:16`, `16:9`, `1:1` |
| `preset` | string | `"cinematic"` | `cinematic`, `reels`, `documentary`, `neutral` |
| `voice` | string | `"en-US-JennyNeural"` | TTS voice key |
| `language` | string | — | Auto-select voice (`english`, `tamil`, `hindi`, etc.) |
| `voiceSpeed` | number | `1.0` | 0.5–2.0 |
| `captions` | string | `"burned"` | `burned`, `karaoke`, `none` |
| `captionTheme` | string | `"minimal"` | `minimal`, `bold`, `highContrast`, `softCard`, `centerPop`, `topTag`, `neon` |
| `transition` | string | `"fade"` | `fade`, `slide`, `zoomblur`, `cut`, `mixed` |
| `grade` | string | `"cinematic"` | `neutral`, `warm`, `cool`, `cinematic`, `vivid`, `sepia` |
| `videoType` | string | — | `facts`, `tutorial`, `story`, `product`, `motivational`, `nature`, `news` |
| `platform` | string | — | `tiktok`, `youtube`, `instagram`, `reels` |
| `kineticText` | bool | `true` | Word animation |
| `kenBurns` | bool | `true` | Zoom on images |
| `vignette` | bool | `true` | Edge darkening |
| `progressBar` | bool | `false` | Bottom progress |
| `jCutSec` | number | `0.0` | Audio-leads-picture |
| `sfx` | bool | `false` | Sound effects |
| `sfxOnCut` | bool | `false` | Whoosh on cuts |
| `backgroundMusic` | string | — | File in `input/bgm/` |
| `musicVolume` | number | `0.15` | 0.0–1.0 |
| `musicIntensity` | string | `"mid"` | `calm`, `mid`, `energetic` |
| `musicQuery` | string | — | Auto-fetch search term |
| `loopMusic` | bool | `false` | Loop track |
| `normalizeLufs` | number | — | e.g. `-14` |
| `intro` | object | — | `{title, subtitle?, durationSec?}` |
| `outro` | object | — | `{ctaText, showSubscribe?, hashtags?, durationSec?}` |
| `titleCard` | object | — | `{title, subtitle?, durationSec?}` |
| `lowerThird` | string | — | Name tag |
| `endCta` | string | — | Simple CTA text |
| `emojiByScene` | object | — | `{"0": "🔥", "1": "💻"}` |
| `watermark` | string | — | Logo in `input/visuals/` |
| `brand` | object | — | `{watermark?, accent?}` |
| `localAssets` | array | — | Files in `input/visuals/` |
| `defaultVisual` | string | — | Fallback image/video |
| `exportFormat` | string | `"mp4"` | `mp4`, `webm`, `gif` |
| `exportAspects` | array | — | `["9:16", "16:9", "1:1"]` |
| `frameRate` | number | `25` | FPS |
| `hardwareEncode` | bool | `false` | GPU encoding |
| `dryRun` | bool | `false` | Plan only, skip render |
| `aiVerify` | object | — | `{enabled, finalMode, ...}` |
| `renderer` | string | `"ffmpeg"` | `ffmpeg`, `remotion` |

---

## Per-Scene Inline Tags (inside `script`)

| Tag | Values | Example |
| :-- | :----- | :------ |
| `[Visual: kw/file]` | Search keyword or filename | `[Visual: mountain sunset]` |
| `[Transition: t]` | `fade`, `slide`, `zoomblur`, `cut` | `[Transition: fade]` |
| `[Grade: g]` | `neutral`, `warm`, `cool`, `cinematic`, `vivid`, `sepia` | `[Grade: cinematic]` |
| `[KenBurns: on/off]` | Enable/disable zoom | `[KenBurns: on]` |
| `[Style: pos]` | `top`, `bottom`, `center` | `[Style: top]` |
| `[Color: c]` | CSS color name | `[Color: yellow]` |
| `[CaptionTheme: t]` | Theme name | `[CaptionTheme: neon]` |
| `[Kinetic: on/off]` | Word animation | `[Kinetic: on]` |
| `[JCut: sec]` | Audio lead | `[JCut: 0.4]` |
| `[Voice: key]` | Voice override | `[Voice: en-US-AriaNeural]` |
| `[Music: file]` | Per-scene music | `[Music: lofi.mp3]` |
| `[Volume: n]` | 0.0–1.0 | `[Volume: 0.8]` |
| `[FadeIn: sec]` | Audio fade in | `[FadeIn: 0.3]` |
| `[Trim: M:M-M:M]` | Clip trim | `[Trim: 0:05-0:12]` |
| `[Sfx: on/off]` | Sound effect | `[Sfx: on]` |
| `[Vignette: on/off]` | Edge darkening | `[Vignette: on]` |

**Example with tags:**
```json
{
  "id": "inline-demo",
  "title": "Inline Tags",
  "script": "Intro. [Visual: technology] [Transition: fade] [Grade: warm] [Kinetic: on]\nMiddle. [Visual: coding] [Style: center] [Color: cyan] [CaptionTheme: neon]\nOutro. [Visual: success] [Transition: zoomblur] [Grade: cinematic] [JCut: 0.5]"
}
```

---

## Quick Examples

### Caption Theme Comparison
```json
// Just change captionTheme: minimal, bold, highContrast, softCard, centerPop, topTag, neon
{ "id": "theme-demo", "title": "Theme Demo", "script": "...", "captionTheme": "neon" }
```

### Voice Variation
```json
{ "id": "voice-demo", "title": "Voice Demo", "voice": "en-US-AriaNeural", "voiceSpeed": 1.1, "ttsStyle": "cheerful" }
```

### Platform Optimized
```json
{ "id": "tiktok-vid", "title": "TikTok Video", "platform": "tiktok", "captionTheme": "highContrast", "sfxOnCut": true }
```

### Intro + Outro
```json
{ "id": "cards", "title": "Card Demo", "script": "...", "intro": {"title":"Hello","subtitle":"Ep 1","durationSec":2}, "outro": {"ctaText":"Subscribe!","showSubscribe":true,"hashtags":["#tag"]} }
```

### Local Assets
```json
{ "id": "local", "title": "Local Demo", "script": "[Visual: my-image.jpg]\nScene one\n[Visual: my-video.mp4]\nScene two", "autoLocalAssets": true }
```

### Per-Scene Emoji
```json
{ "id": "emoji-demo", "title": "Emoji Demo", "script": "Scene one\nScene two\nScene three", "emojiByScene": {"0":"☕","1":"💻","2":"🌅"} }
```

### Multi-Aspect Export
```json
{ "id": "multi", "title": "Multi Export", "script": "...", "exportAspects": ["9:16","16:9","1:1"], "posterScene": 0, "contactSheet": true }
```

### Persona (Voice Clone)
```json
{ "id": "persona", "title": "Persona Demo", "topic": "book review", "script": "A. Narrator: Line one.\nB. Narrator: Line two.\nC. Narrator: Line three.", "personas": [{"id":"narrator","clone":"sample_narrator.wav"}], "defaultPersona":"narrator" }
```

### In-Scene Dialogue
```json
{ "id": "dialogue", "title": "Dialogue Demo", "script": "A. Host: Intro\nB. Guest: Reply\nC. Host: Conclusion", "personas": [{"id":"host","preset":{"engine":"kokoro","voiceId":"af_heart"}},{"id":"guest","preset":{"engine":"kokoro","voiceId":"am_michael"}}], "sceneDialogue": {"1":[{"speaker":"host","text":"Question?"},{"speaker":"guest","text":"Answer."}]} }
```

### AI Verification
```json
{ "id": "verify", "title": "AI Verify", "script": "...", "aiVerify": {"enabled":true,"finalMode":"vision","checkSubjectMatch":true,"checkWatermark":true} }
```

### Full Kitchen Sink
See `agentic-scripts.example.json` id `"sink_everything"` for a job with every feature combined.

---

## Single-Feature Modes

| `mode` | What it does |
| :----- | :----------- |
| `"plan"` | Plan only (no network) |
| `"visuals"` | Download images/videos |
| `"voice"` | Generate voiceovers |
| `"render"` | Render from workspace |
| `"download-images"` | Bulk download images |
| `"download-videos"` | Bulk download videos |
| `"download-music"` | Bulk download music |
| `"generate-voice-edgetts"` | Voice via Edge-TTS |
| `"generate-voice-voicebox"` | Voice via Kokoro |
| `"clone-voice"` | Clone from reference |
| `"download-sfx"` | Download sound effects |
| `"compose"` | Full pipeline with FX |
| `"rerender"` | Re-render from cache |

**Bulk fetch example:**
```json
{ "id": "bulk", "mode": "download-images", "searchQuery": "eagle flying", "downloadCount": 10 }
```

---

## Script Writing Tips

- **Each sentence = one scene.** Use `.` and newlines to control scene breaks.
- **`[Visual: keyword]`** controls what stock footage is fetched. Use descriptive keywords.
- **`[Visual: filename.jpg]`** uses your own file from `input/visuals/`.
- **Scene tags are auto-stripped** from spoken text and subtitles.
- **`hookFirst: true`** reorders your best scene to the front.
- **`variablePacing: true`** varies scene durations for natural rhythm.

---

## Run Commands

```bash
# Modular pipeline (stage by stage)
npm run agentic:modular pipeline --file input/scripts/agentic-scripts.json

# Batch mode with wave scheduling
npm run agentic:batch

# Single job from topic
npm run agentic -- --topic "Your topic" --title "Your Title"
```
