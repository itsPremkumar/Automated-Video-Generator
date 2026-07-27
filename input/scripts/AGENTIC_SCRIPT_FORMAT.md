# Agentic Script Format — Complete Reference

> **File Location**: `input/scripts/agentic-scripts.json`
> **Format**: JSON Array of job objects
> **Pipeline**: `npm run agentic:modular` (modular stages) or `npm run agentic:batch` (batch mode)

---

## 1. Overview

The agentic script format controls a **6-stage AI-powered video pipeline**:

```
PLAN → ACQUIRE → VERIFY → DECIDE (gateway) → GATE → RENDER
```

Every video generation knob — from caption color to per-scene LUT grading, from voice cloning to multi-persona dialogue — is reachable from this single JSON file. No field is required beyond a `title` and `script` (or `topic`); everything else has a sensible default.

---

## 2. Quick Start

```json
[
  {
    "id": "my-first-video",
    "title": "3 Productivity Tips",
    "script": "Start your day with a plan. [Visual: planner notebook]\nSmall wins build momentum. [Visual: checklist]\nYou can do this. [Visual: mountain summit]",
    "orientation": "portrait",
    "voice": "en-US-GuyNeural"
  }
]
```

Run: `npm run agentic:modular pipeline --file input/scripts/agentic-scripts.json`

---

## 3. Top-Level Job Fields

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | auto | Unique ID → output folder `output/{id}/` |
| `title` | **`string`** | **required** | Video title → output filename `{Title}.mp4` |
| `script` | `string` | — | Full script text with optional inline `[Visual: ...]` tags |
| `topic` | `string` | — | Fallback topic when script is auto-generated |
| `mode` | `string` | `"full"` | Execution mode: `full`, `plan`, `visuals`, `voice`, `render`, `download-images`, `download-videos`, `download-music`, `generate-voice-edgetts`, `generate-voice-voicebox`, `clone-voice`, `download-sfx`, `download-url`, `apply-advanced`, `compose`, `rerender` |
| `orientation` | `string` | `"portrait"` | `portrait` (9:16), `landscape` (16:9), `square` (1:1) |
| `aspect` | `string` | `"9:16"` | Aspect ratio override: `9:16`, `16:9`, `1:1` |
| `backend` | `string` | `"agent"` | AI backend: `agent` (default, no API key), `vision` (opt-in Gemini/Ollama) |
| `renderer` | `string` | `"ffmpeg"` | Render engine: `ffmpeg`, `remotion` |

---

## 4. Per-Scene Inline Tags (inside `script`)

These tags are parsed from the script text. Each applies to the sentence/scene it sits in. Tags are **automatically stripped** from spoken text and subtitles.

### 4.1 Visual Control

| Tag | Values | Example |
| :-- | :----- | :------ |
| `[Visual: keyword or file]` | Search keyword or filename in `input/visuals/` | `[Visual: mountain sunset]` |
| `[Text: on\|off]` | Enable/disable on-screen text | `[Text: on]` |
| `[Kinetic: on\|off\|custom]` | Kinetic word animation | `[Kinetic: on]` |

### 4.2 Visual Effects

| Tag | Values | Example |
| :-- | :----- | :------ |
| `[Transition: type]` | `fade`, `slide`, `zoomblur`, `cut`, `xfade` | `[Transition: fade]` |
| `[Grade: preset]` | `neutral`, `warm`, `cool`, `cinematic`, `vivid`, `sepia` | `[Grade: cinematic]` |
| `[KenBurns: on\|off]` | Enable/disable Ken Burns zoom | `[KenBurns: on]` |
| `[Style: pos]` | `top`, `bottom`, `center` | `[Style: top]` |
| `[Color: color]` | CSS color name | `[Color: yellow]` |
| `[CaptionTheme: theme]` | `neon`, `bold`, `softCard`, `highContrast`, `minimal`, `centerPop`, `topTag` | `[CaptionTheme: neon]` |
| `[Vignette: on\|off]` | Edge darkening | `[Vignette: on]` |
| `[Sfx: on\|off]` | Transition sound effects | `[Sfx: on]` |
| `[JCut: seconds]` | Audio-leads-picture offset | `[JCut: 0.4]` |
| `[MusicIntensity: level]` | `calm`, `mid`, `energetic` | `[MusicIntensity: calm]` |

### 4.3 Audio Control

| Tag | Values | Example |
| :-- | :----- | :------ |
| `[Voice: voice-key]` | Override TTS voice for this scene | `[Voice: en-US-AriaNeural]` |
| `[Music: file.mp3]` | Per-scene background music | `[Music: lofi.mp3]` |
| `[Volume: 0.0-1.0]` | Per-scene audio volume | `[Volume: 0.8]` |
| `[FadeIn: seconds]` | Audio fade-in | `[FadeIn: 0.3]` |
| `[FadeOut: seconds]` | Audio fade-out | `[FadeOut: 0.3]` |
| `[Trim: MM:SS-MM:SS]` | Trim local video clip | `[Trim: 0:05-0:12]` |

### 4.4 Example with Inline Tags

```json
{
  "id": "inline-tags-demo",
  "title": "Inline Tags Demo",
  "script": "Welcome to the show. [Visual: studio lights] [Transition: fade] [Grade: warm] [Kinetic: on]\nToday we explore AI. [Visual: artificial intelligence] [Style: center] [Color: cyan] [CaptionTheme: neon]\nThe future is here. [Visual: futuristic city] [Transition: zoomblur] [Grade: cinematic] [JCut: 0.5] [Sfx: on]"
}
```

---

## 5. Caption System

### 5.1 Caption Modes (`captions`)

| Mode | Description |
| :--- | :---------- |
| `"burned"` | (Default) Permanently burned into the video frame |
| `"karaoke"` | Word-by-word highlight animation |
| `"none"` | No captions |

### 5.2 Caption Themes (`captionTheme`)

| Theme | Font | Color | Background | Position |
| :---- | :--- | :---- | :--------- | :------- |
| `"minimal"` | 1.0× | White | None | Bottom |
| `"bold"` | 1.15× | White | None | Bottom |
| `"highContrast"` | 1.1× | Yellow | `rgba(0,0,0,0.55)` | Bottom |
| `"softCard"` | 1.0× | White | `rgba(0,0,0,0.45)` | Bottom |
| `"centerPop"` | 1.2× | White | None | Center |
| `"topTag"` | 0.95× | White | `rgba(0,0,0,0.5)` | Top |
| `"neon"` | (custom) | Cyan/neon | Dark box | Bottom |

### 5.3 Sidecar Captions

| Field | Type | Description |
| :---- | :--- | :---------- |
| `captionFormat` | `"srt"` / `"vtt"` / `"none"` | Sidecar subtitle file next to the MP4 |
| `captionCueMode` | `"sentence"` / `"word"` | Cue granularity |
| `subtitleMode` | `"off"` / `"overlay"` / `"burned"` | Subtitle application mode |
| `languages` | `string[]` | Extra language sidecars (e.g. `["es", "fr", "hi", "ta"]`) |

---

## 6. Voice & TTS

### 6.1 Voice Selection Fields

| Field | Type | Description |
| :---- | :--- | :---------- |
| `voice` | `string` | Global TTS voice key (e.g. `en-US-GuyNeural`) |
| `language` | `string` | Language auto-selects a default voice |
| `voicesByScene` | `object` | Per-scene voice overrides: `{"0": "en-US-AriaNeural", "1": "en-US-GuyNeural"}` |
| `voiceSpeed` | `number` | Speed multiplier (0.5–2.0, default 1.0) |
| `voicePitchSemitones` | `number` | Pitch shift in semitones |
| `voiceAging` | `"younger"`/`"older"` | Voice age preset |
| `ttsStyle` | `string` | Edge-TTS style tag: `cheerful`, `whispering`, `angry`, `excited`, `sad`, `friendly`, `professional` |
| `dubLanguage` | `string` | Language code to dub/translate the script into |
| `useClonedVoiceId` | `string` | Reuse a previously saved cloned voice profile |
| `cloneVoiceFrom` | `string` | Path to reference audio in `input/voices/` |
| `kokoroVoice` | `string` | Kokoro preset voice (e.g. `af_heart`, `am_michael`) |

### 6.2 Supported Voices (sample — 400+ available)

| Key | Gender | Language |
| :-- | :----- | :------- |
| `en-US-JennyNeural` | Female | English (US) |
| `en-US-GuyNeural` | Male | English (US) |
| `en-US-AriaNeural` | Female | English (US) |
| `en-US-ChristopherNeural` | Male | English (US) |
| `en-GB-SoniaNeural` | Female | English (UK) |
| `en-GB-RyanNeural` | Male | English (UK) |
| `en-IN-NeerjaNeural` | Female | English (India) |
| `ta-IN-PallaviNeural` | Female | Tamil |
| `ta-IN-ValluvarNeural` | Male | Tamil |
| `hi-IN-SwararaNeural` | Female | Hindi |
| `es-ES-ElviraNeural` | Female | Spanish |
| `fr-FR-DeniseNeural` | Female | French |
| `de-DE-KatjaNeural` | Female | German |

---

## 7. Visual Style System

### 7.1 Presets (`preset`)

| Preset | Orientation | Transition | Grade | Kinetic | Ken Burns | Vignette | Captions | Music |
| :----- | :---------- | :--------- | :---- | :------ | :-------- | :------- | :------- | :---- |
| `"cinematic"` | portrait | fade | cinematic | ✓ | ✓ | ✓ | burned | mid |
| `"reels"` | portrait | slide | vivid | ✓ | ✓ | ✗ | burned | energetic |
| `"documentary"` | landscape | fade | neutral | ✗ | ✓ | ✓ | burned | calm |
| `"documentary-cool"` | landscape | fade | cool | ✗ | ✓ | ✓ | burned | calm |
| `"neutral"` | portrait | fade | neutral | ✓ | ✗ | ✗ | burned | mid |

### 7.2 Transitions (`transition`)

| Value | Description |
| :---- | :---------- |
| `"fade"` | Crossfade between scenes |
| `"slide"` | Slide-in from right |
| `"zoomblur"` | Zoom with motion blur |
| `"cut"` | Hard cut (no transition) |
| `"xfade"` | FFmpeg crossfade filter |
| `"mixed"` | Auto-pick per scene |

### 7.3 Color Grades (`grade`)

| Value | Description |
| :---- | :---------- |
| `"neutral"` | Natural, ungraded |
| `"warm"` | Golden/warm tones |
| `"cool"` | Blue/cool tones |
| `"cinematic"` | Film-like S-curve |
| `"vivid"` | High saturation/pop |
| `"sepia"` | Vintage sepia tone |

### 7.4 Video Types (`videoType`)

| Type | Description | Default Style |
| :--- | :---------- | :------------ |
| `"facts"` | Educational/factual | Fade + cinematic + kinetic |
| `"tutorial"` | How-to/instructional | Slide + neutral + calm music |
| `"news"` | News/current events | Cut + cool + landscape |
| `"story"` | Narrative/storytelling | Fade + warm + calm music |
| `"product"` | Product promotion | Slide + vivid + energetic |
| `"motivational"` | Inspirational quotes | Zoomblur + cinematic + karaoke |
| `"nature"` | Nature/ambient | Fade + cinematic + no kinetic |

### 7.5 Platform Tailoring (`platform`)

| Platform | Aspect | Style |
| :------- | :----- | :---- |
| `"tiktok"` | 9:16 portrait | Energetic, bold captions |
| `"youtube"` | 16:9 landscape | Cinematic, documentary |
| `"instagram"` | 9:16 portrait | Polished, softCard captions |
| `"reels"` | 9:16 portrait | Slide transitions, vivid |

---

## 8. Audio & Music

### 8.1 Background Music

| Field | Type | Description |
| :---- | :--- | :---------- |
| `backgroundMusic` | `string` | Filename in `input/bgm/` or `input/visuals/` |
| `musicVolume` | `number` | Volume 0.0–1.0 (default ~0.15) |
| `musicQuery` | `string` | Free-music search query for auto-fetch |
| `musicIntensity` | `"calm"`/`"mid"`/`"energetic"` | Ducking depth during speech |
| `loopMusic` | `boolean` | Loop music to fill full video duration |
| `beatSync` | `boolean` | Beat-sync scene cuts to music |

### 8.2 Sound Effects

| Field | Type | Description |
| :---- | :--- | :---------- |
| `sfx` | `boolean` | Global SFX toggle |
| `sfxOnCut` | `boolean` | Whoosh sound on every cut |
| `sfxByScene` | `object` | Per-scene SFX: `{"0": "whoosh", "2": "ding"}` |

### 8.3 Audio Processing

| Field | Type | Description |
| :---- | :--- | :---------- |
| `normalizeLufs` | `number` | Target loudness (e.g. `-14` for broadcast) |
| `duckDepth` | `number` | Global music ducking (0.0–1.0) |
| `duckDepthByScene` | `object` | Per-scene ducking override |
| `voiceVolumeByScene` | `object` | Per-scene voice level |
| `voiceDelayByScene` | `object` | Per-scene voice start delay (seconds) |
| `crossfadeSec` | `number` | Audio crossfade between scenes |
| `audioFilterByScene` | `object` | Per-scene audio filter: `bass_boost`, `treble_boost`, `noise_reduction`, `compressor` |
| `eqByScene` | `object` | Per-scene parametric EQ bands |
| `compressorByScene` | `object` | Per-scene compressor settings |
| `noiseReductionByScene` | `object` | Per-scene noise reduction (0.0–1.0) |
| `reverbByScene` | `object` | Per-scene reverb: `small_room`, `medium_room`, `large_hall`, `cathedral`, `plate` |
| `pitchShiftByScene` | `object` | Per-scene pitch shift (semitones) |
| `tempoByScene` | `object` | Per-scene audio tempo multiplier |

---

## 9. Intro & Outro Cards

### 9.1 Intro Card

```json
"intro": {
  "title": "My Video Title",
  "subtitle": "Episode 1",
  "durationSec": 2
}
```

### 9.2 Title Card (alternative, with more control)

```json
"titleCard": {
  "title": "Space Facts",
  "subtitle": "Episode 1",
  "durationSec": 3
}
```

### 9.3 Outro Card

```json
"outro": {
  "ctaText": "Subscribe for more!",
  "showSubscribe": true,
  "hashtags": ["#tech", "#ai", "#coding"],
  "durationSec": 3
}
```

### 9.4 End CTA (simple)

```json
"endCta": "Follow for daily tips"
```

---

## 10. Visual Effects

### 10.1 Basic Visual Toggles

| Field | Type | Description |
| :---- | :--- | :---------- |
| `kenBurns` | `boolean` | Gentle zoom/pan on still images |
| `vignette` | `boolean` | Cinematic edge darkening |
| `kineticText` | `boolean` | Animated word-by-word lower-third text |
| `progressBar` | `boolean` | Animated progress bar across bottom |
| `jCutSec` | `number` | J-cut audio-leads-picture offset |

### 10.2 Per-Scene Filters

| Field | Type | Description |
| :---- | :--- | :---------- |
| `filterByScene` | `object` | `{"0": "bw", "1": "vintage", "2": "sepia"}` |
| `stabilizeScenes` | `number[]` | Scene indices to stabilize |
| `chromaKeyScenes` | `number[]` | Scene indices for green-screen removal |
| `blurScenes` | `number[]` | Scene indices for background blur |
| `clipSpeedByScene` | `object` | Playback speed per scene: `{"2": 0.5}` (slow-mo) |
| `rotateByScene` | `object` | Rotation degrees per scene |
| `cropByScene` | `object` | Crop box per scene: `{x, y, width, height}` |
| `scaleByScene` | `object` | Scale override per scene |
| `positionByScene` | `object` | Position offset per scene |
| `opacityByScene` | `object` | Opacity per scene (0.0–1.0) |
| `blendModeByScene` | `object` | Blend mode: `normal`, `multiply`, `screen`, `overlay`, `softlight` |
| `mirrorByScene` | `object` | Mirror: `horizontal`, `vertical`, `both` |

### 10.3 Emoji & Overlays

| Field | Type | Description |
| :---- | :--- | :---------- |
| `emojiByScene` | `object` | Emoji per scene: `{"0": "🔥", "1": "🚀"}` |
| `lowerThird` | `string` | Name/title tag (e.g. `"Host — Prem"`) |
| `watermark` | `string` | Logo image path in `input/visuals/` |
| `watermarkRotation` | `number` | Watermark rotation degrees |
| `watermarkShadow` | `object` | Watermark drop shadow: `{x, y, blur, color}` |
| `watermarkByScene` | `object` | Per-scene watermark with position control |
| `brandTintByScene` | `object` | Per-scene brand color tint overlay |

### 10.4 Text & CTA Overlays

| Field | Type | Description |
| :---- | :--- | :---------- |
| `textOverlayByScene` | `object` | Custom text per scene with position/size/color |
| `imageOverlayByScene` | `object` | Image overlay per scene |
| `emojiOverlayByScene` | `object` | Emoji overlay with custom position/size |
| `animatedText` | `array` | Animated text sequence: `[{text, start, end, x, y, fontSize, color}]` |
| `ctaButtonByScene` | `object` | Per-scene CTA button with styling |

---

## 11. Motion Graphics

### 11.1 Advanced Zoom & Pan

| Field | Type | Description |
| :---- | :--- | :---------- |
| `zoomByScene` | `object` | Animated zoom: `{"0": {start: 1.0, end: 1.5}}` |
| `panByScene` | `object` | Pan movement: `{"1": {startX: 0, startY: 0, endX: 50, endY: 30}}` |
| `parallaxDepthByScene` | `object` | 2.5D parallax depth (0–10) |
| `particlesByScene` | `object` | Particle effects: `snow`, `sparkles`, `rain`, `fireflies` |

### 11.2 Advanced Transitions

| Field | Type | Description |
| :---- | :--- | :---------- |
| `transitionInByScene` | `object` | Per-scene transition IN: `fade`, `slide`, `zoomblur`, `cut`, `push`, `wipe`, `cube` |
| `transitionOutByScene` | `object` | Per-scene transition OUT |
| `transitionDurationByScene` | `object` | Per-scene transition duration (seconds) |
| `transitionCurve` | `string` | Curve: `ease-in`, `ease-out`, `ease-in-out`, `linear` |

---

## 12. Color Grading (Advanced)

| Field | Type | Description |
| :---- | :--- | :---------- |
| `lutByScene` | `object` | LUT file per scene (`.cube` in `input/visuals/`) |
| `toneCurveByScene` | `object` | Tone curve: `linear`, `s-curve`, `reverse-s`, `high-contrast`, `low-contrast` |
| `colorWheelsByScene` | `object` | `{shadows: "#hex", midtones: "#hex", highlights: "#hex"}` |
| `contrastByScene` | `object` | Contrast adjustment (-1.0 to 2.0) |
| `saturationByScene` | `object` | Saturation adjustment (0.0 to 3.0) |
| `brightnessByScene` | `object` | Brightness adjustment (-1.0 to 1.0) |
| `gammaByScene` | `object` | Gamma adjustment (0.1 to 3.0) |
| `colorTempByScene` | `object` | Color temperature in Kelvin |
| `highlightsByScene` | `object` | Highlights recovery (0.0–1.0) |
| `shadowsByScene` | `object` | Shadows lift (0.0–1.0) |
| `whitesByScene` | `object` | Whites clip point (0.0–1.0) |
| `blacksByScene` | `object` | Blacks clip point (0.0–1.0) |

---

## 13. Output & Export

### 13.1 Format & Quality

| Field | Type | Description |
| :---- | :--- | :---------- |
| `exportFormat` | `"mp4"`/`"webm"`/`"gif"` | Output container format |
| `exportAspects` | `string[]` | Multi-aspect export: `["9:16", "16:9", "1:1"]` |
| `outputQuality` | `"low"`/`"medium"`/`"high"`/`"lossless"` | Output quality preset |
| `frameRate` | `number` | Frame rate override |
| `keyframeInterval` | `number` | Keyframe interval (seconds) |
| `hardwareEncode` | `boolean` | Use hardware encoding (NVIDIA NVENC, Apple VT) |
| `halfResolution` | `boolean` | Half-res preview (faster) |
| `doubleResolution` | `boolean` | Double-res high-DPI output |

### 13.2 Media & Artifacts

| Field | Type | Description |
| :---- | :--- | :---------- |
| `posterScene` | `number` | Scene index to use as poster/thumbnail |
| `contactSheet` | `boolean` | Generate contact sheet of all scenes |
| `loopVideo` | `number` | Loop entire video N times |
| `outputName` | `string` | Custom output filename |
| `licenseFilter` | `string` | Media license filter: `cc0`, `cc-by`, `public` |
| `paletteFilter` | `string` | Color palette filter: `blue`, `teal`, `warm`, `cool`, `cinematic`, `cyberpunk` |

---

## 14. Scene Editing & Composition

### 14.1 Structure Control

| Field | Type | Description |
| :---- | :--- | :---------- |
| `hookFirst` | `boolean` | Reorder most intriguing scene first |
| `variablePacing` | `boolean` | Vary scene durations for rhythm |
| `sceneOrder` | `number[]` | Explicit scene order: `[2, 0, 1]` |
| `deleteScenes` | `number[]` | Remove these scene indices |
| `sceneDurationByScene` | `object` | Override auto-calculated durations |
| `minSceneDuration` | `number` | Minimum scene duration (seconds) |
| `maxSceneDuration` | `number` | Maximum scene duration (seconds) |

### 14.2 Local Assets

| Field | Type | Description |
| :---- | :--- | :---------- |
| `localAssets` | `string[]` | Filenames in `input/visuals/` to use instead of stock |
| `autoLocalAssets` | `boolean` | Auto-detect all files in `input/visuals/` |
| `videoClips` | `string[]` | Per-scene video clips from `input/visuals/` |
| `personalAudio` | `string[]` | Per-scene custom voiceover files from `input/voiceover/` |
| `defaultVisual` | `string` | Fallback visual when fetch fails |

---

## 15. Multi-Persona & Dialogue System

### 15.1 Personas

Define a voice cast:

```json
"personas": [
  { "id": "host", "preset": { "engine": "kokoro", "voiceId": "af_heart" } },
  { "id": "guest", "preset": { "engine": "kokoro", "voiceId": "am_michael" } },
  { "id": "narrator", "clone": "my_voice_sample.wav" }
],
"defaultPersona": "narrator",
"scenePersonas": {
  "0": "narrator",
  "1": "host",
  "2": "guest"
}
```

### 15.2 In-Scene Dialogue

Two (or more) speakers talking within a single scene:

```json
"sceneDialogue": {
  "1": [
    { "speaker": "host", "text": "So the AI just writes its own code now?" },
    { "speaker": "guest", "text": "Basically, with a human reviewing each patch." },
    { "speaker": "host", "text": "That actually sounds reasonable." }
  ]
}
```

### 15.3 Dialogue Voices (alternating per scene)

```json
"dialogueVoices": ["en-US-AriaNeural", "en-US-GuyNeural"]
```

---

## 16. Brand Kit

| Field | Type | Description |
| :---- | :--- | :---------- |
| `brand` | `object` | `{ watermark: "logo.png", accent: "#FF6B35" }` |
| `fontFamily` | `string` | Font family for captions/titles |
| `fontColor` | `string` | Font color (CSS) |
| `fontWeight` | `number` | Font weight (100–900) |

---

## 17. AI Verification System

```json
"aiVerify": {
  "enabled": true,
  "minConfidence": 6,
  "verifyOnAcquire": true,
  "verifyOnApprove": true,
  "verifyOnEdit": true,
  "verifyOnRender": true,
  "finalMode": "vision",
  "checkSubjectMatch": true,
  "checkWatermark": true,
  "checkSafety": true,
  "checkMusicMood": false,
  "checkSpeechClarity": false,
  "checkBackgroundNoise": false
}
```

| Field | Type | Default | Description |
| :---- | :--- | :------ | :---------- |
| `enabled` | `boolean` | `false` | Master toggle |
| `minConfidence` | `number` | `6` | Minimum score (0–10) |
| `verifyOnAcquire` | `boolean` | `false` | Check on asset download |
| `verifyOnApprove` | `boolean` | `false` | Check before approving |
| `verifyOnEdit` | `boolean` | `false` | Check after scene edits |
| `verifyOnRender` | `boolean` | `false` | Check final rendered MP4 |
| `finalMode` | `"signal"`/`"vision"` | `"signal"` | Post-render gate strength |
| `checkSubjectMatch` | `boolean` | `true` | Visual subject relevance |
| `checkWatermark` | `boolean` | `true` | Watermark/safety detection |
| `checkSafety` | `boolean` | `true` | NSFW content check |

---

## 18. Single-Feature Execution Modes

Set the `"mode"` field to run ONLY one stage of the pipeline.

| Mode | What it does |
| :--- | :----------- |
| `"plan"` | Parse script → build plan.json (scene list + keywords). No network. |
| `"visuals"` | Download images/videos for each scene. Reuses existing plan. |
| `"voice"` | Generate voiceovers. Reuses existing plan. |
| `"render"` | Render video from existing workspace artifacts. |
| `"edit"` | Edit a specific scene (change visual, voice, style). |
| `"list"` | List all scenes in workspace with their current state. |
| `"critique"` | AI critique of the plan. |
| `"revise"` | Revise plan based on critique. |
| `"reorder"` | Reorder scenes. |
| `"download-images"` | Download only images. Supports `searchQuery` + `downloadCount`. |
| `"download-videos"` | Download only videos. Supports `searchQuery` + `downloadCount`. |
| `"download-music"` | Download only music tracks. |
| `"download-sfx"` | Download sound effects. |
| `"download-url"` | Download from a direct URL. |
| `"generate-voice-edgetts"` | Generate voiceover via Edge-TTS only. |
| `"generate-voice-voicebox"` | Generate voiceover via Voicebox/Kokoro only. |
| `"clone-voice"` | Clone a voice from reference audio. |
| `"apply-advanced"` | Apply advanced FX/composition to existing workspace. |
| `"compose"` | Full compose: fetch + voice + render with all FX. |
| `"rerender"` | Re-render from cache with new settings. |

### Bulk Fetch Example

```json
{
  "id": "bulk-eagle-images",
  "title": "Eagle Reference Pack",
  "mode": "download-images",
  "searchQuery": "eagle flying",
  "downloadCount": 10,
  "orientation": "landscape",
  "licenseFilter": "cc0",
  "paletteFilter": "blue"
}
```

---

## 19. Batch & Automation

| Field | Type | Description |
| :---- | :--- | :---------- |
| `variants` | `number` | Generate N variants with different random seeds |
| `seed` | `number` | Random seed for reproducible variants |
| `priority` | `"low"`/`"normal"`/`"high"`/`"urgent"` | Batch scheduling priority |
| `retryCount` | `number` | Auto-retry on failure |
| `timeoutSec` | `number` | Per-job timeout (seconds) |
| `maxAttempts` | `number` | Autopilot retry budget (default 3) |
| `tags` | `string[]` | Organizational tags |
| `description` | `string` | Human-readable description |
| `specVersion` | `string` | Job spec format version |
| `pruneWorkspaces` | `number` | Workspaces to keep after pruning |
| `brain` | `object` | Model circuit-breaker: `{maxCalls, maxFails}` |
| `dryRun` | `boolean` | Plan + inspect only, skip render |

---

## 20. Complete Field Reference Table

### 20.1 Core & Identity

| Field | Type | Default |
| :---- | :--- | :------ |
| `id` | `string` | auto-generated |
| `title` | `string` | **required** |
| `script` | `string` | — |
| `topic` | `string` | — |
| `mode` | `string` | `"full"` |
| `description` | `string` | — |
| `tags` | `string[]` | — |
| `specVersion` | `string` | — |

### 20.2 Orientation & Aspect

| Field | Type | Default |
| :---- | :--- | :------ |
| `orientation` | `"portrait"`/`"landscape"`/`"square"` | `"portrait"` |
| `aspect` | `"9:16"`/`"16:9"`/`"1:1"` | `"9:16"` |
| `format` | `string` | — |

### 20.3 Visual Style

| Field | Type | Default |
| :---- | :--- | :------ |
| `preset` | `string` | `"cinematic"` |
| `transition` | `string` | `"fade"` |
| `grade` | `string` | `"cinematic"` |
| `kenBurns` | `boolean` | `true` |
| `vignette` | `boolean` | `true` |
| `kineticText` | `boolean` | `true` |
| `videoType` | `string` | — |
| `platform` | `string` | — |

### 20.4 Captions

| Field | Type | Default |
| :---- | :--- | :------ |
| `captions` | `"burned"`/`"karaoke"`/`"none"` | `"burned"` |
| `captionTheme` | `string` | `"minimal"` |
| `languages` | `string[]` | — |
| `subtitleMode` | `string` | `"burned"` |
| `captionFormat` | `"srt"`/`"vtt"`/`"none"` | `"none"` |
| `captionCueMode` | `"sentence"`/`"word"` | `"sentence"` |

### 20.5 Voice & Audio

| Field | Type | Default |
| :---- | :--- | :------ |
| `voice` | `string` | `"en-US-JennyNeural"` |
| `language` | `string` | — |
| `voicesByScene` | `object` | — |
| `voiceSpeed` | `number` | `1.0` |
| `voicePitchSemitones` | `number` | — |
| `voiceAging` | `string` | — |
| `ttsStyle` | `string` | — |
| `dubLanguage` | `string` | — |
| `useClonedVoiceId` | `string` | — |
| `cloneVoiceFrom` | `string` | — |
| `kokoroVoice` | `string` | — |

### 20.6 Music

| Field | Type | Default |
| :---- | :--- | :------ |
| `backgroundMusic` | `string` | — |
| `musicVolume` | `number` | `0.15` |
| `musicQuery` | `string` | — |
| `musicIntensity` | `"calm"`/`"mid"`/`"energetic"` | `"mid"` |
| `loopMusic` | `boolean` | `false` |
| `beatSync` | `boolean` | `false` |

### 20.7 Audio Processing

| Field | Type | Default |
| :---- | :--- | :------ |
| `normalizeLufs` | `number` | — |
| `duckDepth` | `number` | — |
| `duckDepthByScene` | `object` | — |
| `voiceVolumeByScene` | `object` | — |
| `voiceDelayByScene` | `object` | — |
| `crossfadeSec` | `number` | `0.4` |
| `sfx` | `boolean` | `false` |
| `sfxOnCut` | `boolean` | `false` |
| `sfxByScene` | `object` | — |

### 20.8 Audio FX (Advanced)

| Field | Type |
| :---- | :--- |
| `audioFilterByScene` | `object` |
| `eqByScene` | `object` |
| `compressorByScene` | `object` |
| `noiseReductionByScene` | `object` |
| `reverbByScene` | `object` |
| `pitchShiftByScene` | `object` |
| `tempoByScene` | `object` |

### 20.9 Intro/Outro

| Field | Type |
| :---- | :--- |
| `intro` | `{title, subtitle?, durationSec?}` |
| `outro` | `{ctaText, showSubscribe?, hashtags?, durationSec?}` |
| `titleCard` | `{title, subtitle?, durationSec?}` |
| `endCta` | `string` |
| `lowerThird` | `string` |

### 20.10 Visual Filters

| Field | Type |
| :---- | :--- |
| `filterByScene` | `object` |
| `stabilizeScenes` | `number[]` |
| `chromaKeyScenes` | `number[]` |
| `blurScenes` | `number[]` |
| `clipSpeedByScene` | `object` |
| `rotateByScene` | `object` |
| `cropByScene` | `object` |
| `scaleByScene` | `object` |
| `positionByScene` | `object` |
| `opacityByScene` | `object` |
| `blendModeByScene` | `object` |
| `mirrorByScene` | `object` |

### 20.11 Overlays

| Field | Type |
| :---- | :--- |
| `emojiByScene` | `object` |
| `textOverlayByScene` | `object` |
| `imageOverlayByScene` | `object` |
| `emojiOverlayByScene` | `object` |
| `animatedText` | `array` |
| `ctaButtonByScene` | `object` |
| `watermark` | `string` |
| `watermarkRotation` | `number` |
| `watermarkShadow` | `object` |
| `watermarkByScene` | `object` |
| `brandTintByScene` | `object` |

### 20.12 Motion Graphics

| Field | Type |
| :---- | :--- |
| `zoomByScene` | `object` |
| `panByScene` | `object` |
| `parallaxDepthByScene` | `object` |
| `particlesByScene` | `object` |
| `progressBar` | `boolean` |
| `jCutSec` | `number` |

### 20.13 Advanced Transitions

| Field | Type |
| :---- | :--- |
| `transitionInByScene` | `object` |
| `transitionOutByScene` | `object` |
| `transitionDurationByScene` | `object` |
| `transitionCurve` | `string` |

### 20.14 Color Grading (Advanced)

| Field | Type |
| :---- | :--- |
| `lutByScene` | `object` |
| `toneCurveByScene` | `object` |
| `colorWheelsByScene` | `object` |
| `contrastByScene` | `object` |
| `saturationByScene` | `object` |
| `brightnessByScene` | `object` |
| `gammaByScene` | `object` |
| `colorTempByScene` | `object` |
| `highlightsByScene` | `object` |
| `shadowsByScene` | `object` |
| `whitesByScene` | `object` |
| `blacksByScene` | `object` |

### 20.15 Multi-Persona

| Field | Type |
| :---- | :--- |
| `personas` | `array` |
| `defaultPersona` | `string` |
| `scenePersonas` | `object` |
| `sceneDialogue` | `object` |
| `dialogueVoices` | `array` |

### 20.16 Scene Structure

| Field | Type |
| :---- | :--- |
| `hookFirst` | `boolean` |
| `variablePacing` | `boolean` |
| `sceneOrder` | `number[]` |
| `deleteScenes` | `number[]` |
| `sceneDurationByScene` | `object` |
| `minSceneDuration` | `number` |
| `maxSceneDuration` | `number` |
| `loopVideo` | `number` |

### 20.17 Local Assets

| Field | Type |
| :---- | :--- |
| `localAssets` | `string[]` |
| `autoLocalAssets` | `boolean` |
| `videoClips` | `string[]` |
| `personalAudio` | `string[]` |
| `defaultVisual` | `string` |

### 20.18 Export

| Field | Type | Default |
| :---- | :--- | :------ |
| `exportFormat` | `string` | `"mp4"` |
| `exportAspects` | `string[]` | — |
| `outputQuality` | `string` | `"high"` |
| `frameRate` | `number` | `25` |
| `keyframeInterval` | `number` | — |
| `hardwareEncode` | `boolean` | `false` |
| `halfResolution` | `boolean` | `false` |
| `doubleResolution` | `boolean` | `false` |
| `outputName` | `string` | — |
| `posterScene` | `number` | — |
| `contactSheet` | `boolean` | `false` |

### 20.19 Media Sourcing

| Field | Type |
| :---- | :--- |
| `preferVisual` | `"image"`/`"video"` |
| `candidatesPerAsset` | `number` |
| `licenseFilter` | `string` |
| `paletteFilter` | `string` |
| `searchQuery` | `string` |
| `downloadCount` | `number` |
| `downloadUrl` | `string` |
| `downloadUrlKind` | `string` |

### 20.20 Brand & Typography

| Field | Type |
| :---- | :--- |
| `brand` | `object` |
| `fontFamily` | `string` |
| `fontColor` | `string` |
| `fontWeight` | `number` |

### 20.21 AI Verification

| Field | Type |
| :---- | :--- |
| `aiVerify` | `object` |
| `verifyScenes` | `boolean` |
| `verifyFinal` | `boolean` |
| `minConfidence` | `number` |
| `verifyPrompt` | `string` |

### 20.22 Batch & Automation

| Field | Type |
| :---- | :--- |
| `variants` | `number` |
| `seed` | `number` |
| `priority` | `string` |
| `retryCount` | `number` |
| `timeoutSec` | `number` |
| `maxAttempts` | `number` |
| `pruneWorkspaces` | `number` |
| `brain` | `object` |
| `dryRun` | `boolean` |
| `backend` | `string` |
| `renderer` | `string` |
| `agent` | `object` |

---

## 21. Examples by Category

| # | Category | `id` prefix | Example File |
| :- | :------- | :---------- | :----------- |
| 1 | Basic | `basic_*` | Minimal script → video |
| 2 | Inline tags | `tags_*` | Per-scene [Visual], [Transition], [Grade] |
| 3 | Caption themes | `caption_*` | All 7 caption themes |
| 4 | Voice | `voice_*` | Voice selection, speed, pitch, style |
| 5 | Visual presets | `preset_*` | Cinematic, reels, documentary, neutral |
| 6 | Video types | `vtype_*` | Facts, tutorial, story, product, motivational |
| 7 | Platform | `plat_*` | TikTok, YouTube, Instagram, Reels |
| 8 | Transitions | `xfade_*` | Fade, slide, zoomblur, cut, mixed |
| 9 | Grades | `grade_*` | Warm, cool, cinematic, vivid, sepia |
| 10 | Background music | `music_*` | musicQuery, musicIntensity, loopMusic |
| 11 | Intro/Outro | `card_*` | titleCard, outro with CTA/hashtags |
| 12 | Visual effects | `vfx_*` | Ken Burns, vignette, progressBar, jCut |
| 13 | Per-scene filters | `filter_*` | BW, vintage, sepia, stabilize, chromaKey |
| 14 | Emoji & overlays | `overlay_*` | emojiByScene, lowerThird, watermark |
| 15 | Color grading | `gradeadv_*` | LUTs, tone curves, color wheels |
| 16 | Audio processing | `audio_*` | EQ, compressor, reverb, noise reduction |
| 17 | Motion graphics | `motion_*` | Zoom, pan, parallax, particles |
| 18 | Multi-persona | `persona_*` | Host/guest, sceneDialogue, voice cloning |
| 19 | Local assets | `local_*` | localAssets, autoLocalAssets, defaultVisual |
| 20 | Export | `export_*` | Multi-aspect, hardware encode, quality |
| 21 | Single-feature modes | `sf_*` | download-images, clone-voice, plan-only |
| 22 | Batch | `batch_*` | Variants, priority, retry, tags |
| 23 | Brand kit | `brand_*` | accent color, fontFamily, fontWeight |
| 24 | AI verify | `verify_*` | AI verification with finalMode=vision |
| 25 | Kitchen sink | `sink_*` | Every feature stacked together |

See `input/scripts/agentic-scripts.json` for runnable examples of every category.

---

## 22. Operational Notes & Gotchas (verified against the source)

These fill the gaps the field tables above don't cover — learned from real runs of
this exact repo. Read this before your first render.

### 22.1 Running a dedicated job file (don't edit the big JSON)

`npm run agentic:modular` and `npm run agentic:batch` **both default to
`input/scripts/agentic-scripts.json`** and run *every* job in it. To run just one
job (or a small custom file) without touching that big array, pass `--file`:

```bash
# Modular stages, single dedicated file:
npx tsx src/adapters/cli/agentic-modular.ts pipeline --file input/scripts/my-reel-job.json

# Or individual stages against the same file:
npx tsx src/adapters/cli/agentic-modular.ts voice  --file input/scripts/my-reel-job.json
npx tsx src/adapters/cli/agentic-modular.ts render --file input/scripts/my-reel-job.json
```

> `agentic:modular` reads `--file` (relative or absolute). `agentic:batch` does **not**
> take `--file` — it always reads `agentic-scripts.json`. Use the modular CLI for
> single-file jobs.

### 22.2 Output location & filename

- Output folder = `output/{id}/`  ← uses the job `id`, not the title.
- Output **file** = `{title}.mp4`  ← uses the job `title`.
  (Section 3's "`{Title}.mp4`" is correct; just note the *folder* uses `id`.)
- Multi-aspect / poster / contact-sheet / sidecar `.srt`/`.vtt` are written alongside it.

### 22.3 `[Visual: ...]` is NOT a hard local-asset lock

This is the most common surprise. Inline `[Visual: name]` behaves as follows:

- If `input/visuals/name` **exists** → used as a local asset (image or video by extension).
- If it does **NOT** exist → the text is treated as a **stock search keyword** and the
  pipeline fetches from Pexels → Openverse/Wikimedia. So `[Visual: career-tools.png]`
  only binds your screenshot if that file is actually present in `input/visuals/`.

The same applies to the top-level `localAssets` / `videoClips` arrays: filenames there
are resolved against `input/visuals/` and fall back to stock keywords when missing.

### 22.4 Re-binding assets for a re-render (render stage reads the manifest, not plan.json)

The `render` subcommand does **not** re-read `plan.json` `localAsset` bindings. It
reads `workspace/jobs/{id}/render-manifest.json` (and falls back to `scene-data.json`).
So if you edited `plan.json` to point a scene at a local screenshot but the render still
shows stock footage, patch the manifest instead:

```jsonc
// workspace/jobs/{id}/render-manifest.json  →  assets[] entries
{ "sceneIndex": 2, "kind": "image",
  "localPath": "C:\\one\\Automated-Video-Generator\\input\\visuals\\interview-experiences.png",
  "license": "User-supplied — owner attribution" }
```

Then re-run `render` (or `render --file …`). The per-scene `visualPreference` should be
`"image"` for stills and `"video"` for clips.

### 22.5 Background music path is `input/bgm/`, not `input/visuals/`

`backgroundMusic: "lofi.mp3"` resolves against **`input/bgm/`** (see `src/lib/path-safety.ts`
→ `inputBgmPath`). If you drop the file in `input/visuals/` it will not be found.
(Stock music via `musicQuery` needs no file — it auto-fetches free tracks.)

### 22.6 Voice: local Kokoro backend (zero API key)

- `voice` (Edge-TTS keys like `en-US-GuyNeural`) works offline via the bundled backend.
- `kokoroVoice` (e.g. `af_heart`, `am_michael`) uses the self-contained
  **`src/speech`** Python backend (the repo `venv/Scripts/python.exe`). On first use it
  lazily loads the Kokoro model (one-time download, then cached).
- Cloned voices (`cloneVoiceFrom` / `useClonedVoiceId`) need a real reference clip in
  `input/voices/`.
- `TTS_PROVIDER` defaults to `voicebox`; Kokoro still runs through the same bundled
  backend. No external API key is required for any of these.

### 22.7 Pipeline can hang at the gateway/verify stage — run stages separately

On constrained machines the monolithic `pipeline` run has been observed to **stall**
between the visuals stage and voice generation (the gateway/verification step blocks,
not the download). Symptom: log shows `✅ Acquired N candidates` then no further
progress for minutes. Workaround — drive the stages yourself; they reuse the same
workspace:

```bash
npx tsx src/adapters/cli/agentic-modular.ts plan   --file <job>.json   # 1
npx tsx src/adapters/cli/agentic-modular.ts voice  --file <job>.json   # 2 (Kokoro per scene)
npx tsx src/adapters/cli/agentic-modular.ts render --file <job>.json   # 3
```

Voice generation is **per-scene and somewhat slow** (a few seconds each on CPU); a
12-scene reel takes a couple of minutes end-to-end. Audio is cached per scene, so a
re-run of `voice` is fast.

### 22.8 AI verification (`aiVerify`) is OPT-IN and off by default

`aiVerify` does nothing unless `enabled: true` **and** a verification model is
configured (local Ollama / Gemini). It is **not** enabled by default in `.env`.
Without it, assets flow straight to editing unverified. Turning it on via the JSON job
is sufficient; no `.env` change needed for the JSON path.

### 22.9 Editing a single scene after render

```bash
npx tsx src/adapters/cli/agentic-modular.ts edit --scene 3 --visual "career-tools.png" --grade warm
npx tsx src/adapters/cli/agentic-modular.ts list          # inspect current scene state
npx tsx src/adapters/cli/agentic-modular.ts critique      # director's critique (aspect/black frames)
npx tsx src/adapters/cli/agentic-modular.ts revise --auto # self-heal from critique
```

### 22.10 Captions are stripped from speech

Everything inside `[…]` inline tags is removed from both the spoken narration and the
burned/karaoke subtitles — only the plain sentence text is voiced.

### 22.11 Minimal verified working example (career-platform reel shape)

```json
[
  {
    "id": "career_platform_reel",
    "title": "SkillForge — Free Career Platform for Students",
    "script": "90+ free tools. [Visual: career-tools.png] [Grade: cool]\nReal interview experiences from Amazon, Google, Microsoft. [Visual: interview-experiences.png] [Grade: cinematic]",
    "orientation": "portrait",
    "aspect": "9:16",
    "kokoroVoice": "af_heart",
    "captions": "burned",
    "captionTheme": "neon",
    "kineticText": true,
    "vignette": true,
    "musicQuery": "upbeat corporate technology",
    "defaultVisual": "hero.png",
    "intro": { "title": "SkillForge", "subtitle": "Free for students", "durationSec": 2 },
    "outro": { "ctaText": "Search SkillForge", "durationSec": 2 }
  }
]
```

Run it with: `npx tsx src/adapters/cli/agentic-modular.ts pipeline --file input/scripts/my-reel-job.json`
(Place `career-tools.png`, `interview-experiences.png`, `hero.png` in `input/visuals/` first — see §22.3.)

### 22.12 Download options — single-asset AND bulk

The pipeline can fetch assets two ways: **(A) only what a script needs**, or
**(B) bulk packs of N distinct images/videos/music** for a subject. Both are driven by
`src/adapters/cli/agentic-batch.ts` (the `agentic:batch` CLI). Verified against source.

#### A) Download ONLY the assets a job requires

Use the single-feature `--mode` flags. These download just images / videos / music for
the scenes in your job (no render):

```bash
# From agentic-scripts.json, only fetch the visuals a job needs:
npx tsx src/adapters/cli/agentic-batch.ts --mode download-images   # images only
npx tsx src/adapters/cli/agentic-batch.ts --mode download-videos   # videos only
npx tsx src/adapters/cli/agentic-batch.ts --mode download-music    # music only
npx tsx src/adapters/cli/agentic-batch.ts --mode download-sfx      # sound effects only
npx tsx src/adapters/cli/agentic-batch.ts --mode download-url      # from a direct URL

# Or scope to ONE job by id (useful in a big array):
npx tsx src/adapters/cli/agentic-batch.ts --mode download-images --job career_platform_reel
```

Equivalent JSON `mode` values (set on the job): `"download-images"`, `"download-videos"`,
`"download-music"`, `"download-sfx"`, `"download-url"` (see §3 and §18).

#### B) Bulk download — N distinct assets for a subject

Two ways to pull a *pack* of unrelated clips/images (e.g. a stock b-roll library):

**1. Ad-hoc CLI (no JSON editing needed):** the `--search` / `--count` flags.

```bash
# 10 eagle images, no job file required:
npx tsx src/adapters/cli/agentic-batch.ts --search "eagle" --count 10

# 5 ocean-wave VIDEOS:
npx tsx src/adapters/cli/agentic-batch.ts --search "ocean waves" --count 5 --kind video

# optional orientation filter (portrait/landscape/square):
npx tsx src/adapters/cli/agentic-batch.ts --search "city skyline" --count 8 --kind video --orientation portrait
```

Files land in `workspace/bulk/{images|videos}/<search-slug>/`.

**2. From a job in `agentic-scripts.json`** (the batch "bulk" path):

```json
{
  "id": "bulk-eagle-pack",
  "title": "Eagle Reference Pack",
  "mode": "download-images",
  "searchQuery": "eagle flying",
  "downloadCount": 10,
  "orientation": "landscape",
  "licenseFilter": "cc0",
  "paletteFilter": "blue"
}
```

> **Important:** on the bulk job path the pipeline **ignores your `script`** and instead
> pulls `downloadCount` distinct assets of `searchQuery` (filtered by `licenseFilter` /
> `paletteFilter`). It is a stock-library builder, not a scene fetcher.

#### BGM / background music download

Music has its own dedicated download path (no `--kind music` flag needed):

```bash
# Fetch only the free background-music tracks a job needs:
npx tsx src/adapters/cli/agentic-batch.ts --mode download-music

# Scoped to one job:
npx tsx src/adapters/cli/agentic-batch.ts --mode download-music --job career_platform_reel
```

- Source: `resolveFreeBackgroundMusic` (see `src/agentic/operations/single-feature.ts`).
- **Query:** `musicQuery` on the job (falls back to `topic`/`title` if unset).
  JSON form: `{ "mode": "download-music", "musicQuery": "upbeat corporate technology" }`.
- **Where files land:** `workspace/jobs/{id}/download-music/`.
- **Bulk music pack:** `bulk-fetch` supports `kind: "music"` too, so you can pull a
  pack of N tracks for a subject the same way as images/videos:
  ```json
  { "id": "bulk-lofi-pack", "mode": "download-music",
    "searchQuery": "lofi chill", "downloadCount": 8 }
  ```
- **Local file instead of fetch:** drop a track in `input/bgm/` and set
  `backgroundMusic: "your-track.mp3"` (see §22.5). Fetched tracks are auto-used when
  `musicQuery` is set and no local file is supplied.

#### Apply one setting to every job (broadcast)

```bash
# Re-grade / re-export ALL jobs in one command:
npx tsx src/adapters/cli/agentic-batch.ts --mode render --broadcast "grade:cinematic"
npx tsx src/adapters/cli/agentic-batch.ts --mode download-images --broadcast "licenseFilter:cc0"
```

`--broadcast "field:value"` mutates that field on every matched job before dispatch.

### 22.13 Single-Image Toolbox (`agentic:image`)

The video editor (`agentic:editor.ts`) only accepts **video** inputs. For still images
there is a dedicated **image toolbox** — `src/adapters/cli/agentic-image.ts`, run via
`npm run agentic:image`. Every advanced edit you'd expect on a lone image is here,
plus the three image-only operations the pipeline previously lacked.

```bash
npm run agentic:image <command> -- --input <image> [options]
# or directly:
npx tsx src/adapters/cli/agentic-image.ts <command> --input <image> [options]
```

| Command | What it does | Key options |
| :------ | :---------- | :---------- |
| `convert` | **Image format conversion** (png→jpg/webp/tiff/bmp/gif) | `--output out.webp`, `--quality 90` |
| `resize` | Scale to w×h (aspect-kept, padded) | `--w 1080 --h 1080` |
| `crop` | Crop region | `--w 1080 --h 1920 --x 100 --y 200` |
| `rotate` | 90/180/270/`hflip`/`vflip`/free° | `--angle 90` |
| `flip` | hflip / vflip convenience | `--dir h` |
| `adjust` | brightness/contrast/saturation/gamma | `--brightness 0.05 --contrast 1.2 --saturation 1.3` |
| `blur` | Whole or region `w:h:x:y` | `--strength 8 --region 200:200:100:100` |
| `text` | **Burn text onto the image** (sharp+SVG) | `--text "Free for students" --color white --size 90` |
| `emoji` | **Burn an emoji/sticker** (sharp+SVG, Segoe UI Emoji) | `--emoji "🔥" --size 260` |
| `watermark` | Overlay a logo image (corner + opacity) | `--image logo.png --position bottom-right --scale 0.15 --opacity 0.8` |
| `tint` | Brand color tint overlay | `--color #7C3AED --alpha 0.2` |
| `vignette` | Edge darkening | `--amount PI/5` |
| `border` | Colored border/padding | `--size 40 --color white` |
| `enhance` | Denoise + sharpen + deblock | `--denoise --sharpen` |
| `info` | Show image metadata (dims/format/size) | — |
| `to-video` | **Image → video** (Ken Burns zoom + optional text + music) | `--duration 5 --w 1080 --h 1920 --kenburns --text "..." [--music track.mp3]` |
| `gif` | Image → animated GIF (Ken Burns loop) | `--duration 3 --fps 15` |
| `contact-sheet` | Stack N images into one sheet (sharp) | `--files "a.png,b.png,c.png" --w 480 --gap 12` |

**Notes (verified during build):**
- `convert`, `crop`, `resize`, `rotate`, `adjust`, `blur`, `tint`, `vignette`, `border`,
  `enhance`, `watermark`, `to-video`, `gif` are ffmpeg (`ffmpeg-static`) wrappers.
- `text` and `emoji` use **sharp + SVG** (not ffmpeg `drawtext`) because the bundled
  ffmpeg build can't render color emoji — sharp renders them via Segoe UI Emoji.
- `contact-sheet` uses **sharp** compositing (the bundled ffmpeg's `vstack` is broken).
- `to-video` outputs a real 9:16/16:9/etc. MP4 (e.g. `--w 1080 --h 1920`) with a slow
  Ken Burns zoom and optional burned caption — this is the "image into video" conversion
  that previously only existed inside the full pipeline.

**Examples:**
```bash
# Convert a screenshot to JPG (smaller file)
npm run agentic:image convert -- --input shot.png --output shot.jpg

# Turn one screenshot into a 5s Ken Burns reel clip with a caption
npm run agentic:image to-video -- --input shot.png --duration 5 --w 1080 --h 1920 \
  --kenburns --text "Built by students, for students" --output clip.mp4

# Burn a promo line + emoji onto a poster
npm run agentic:image text  -- --input poster.png --text "Free forever" --size 100 --output poster_txt.png
npm run agentic:image emoji -- --input poster_txt.png --emoji "🚀" --size 220 --output poster_done.png
```

### 22.14 Single-Video Editor (`agentic:editor`)

For editing an **existing video file** (not the pipeline), use `agentic-editor.ts`:
`npm run agentic:editor <command> -- --input <video> [options]`
(or `npx tsx src/adapters/cli/agentic-editor.ts <command> --input <video>`).

| Command | What it does | Key options |
| :------ | :---------- | :---------- |
| `trim` | Cut by start/end/duration | `--start 00:05 --end 00:15` |
| `split` | Split at timestamp | `--at 00:10` |
| `split-scenes` | Auto scene-detect + split | `--threshold 0.3` |
| `concat-scene` | Extract one scene from a rendered job | `--job <id> --scene 3` |
| `crop` | Crop region | `--w 720 --h 720 --x 0 --y 0` |
| `resize` | Scale to w×h | `--w 1920 --h 1080` |
| `rotate` | 90/180/270/flip/free° | `--angle 90` |
| `speed` | Playback speed 0.25×–4× | `--rate 2.0` |
| `overlay-text` | Burn caption onto video | `--text "Hello" --color white` |
| `overlay-image` | Basic logo overlay | `--image logo.png` |
| `watermark` | **Logo overlay w/ rotation+shadow+opacity+scale** | `--image logo.png --rotation 12 --opacity 0.8 --shadow --scale 0.2` |
| `pip` | Picture-in-picture overlay | `--overlay clip.mp4 --position bottom-right` |
| `mute` | **Remove the entire audio track** | — |
| `extract-audio` | Save audio as MP3/WAV | `--output a.mp3` |
| `replace-audio` | Swap in a different audio file | `--audio track.mp3` |
| `audio-filter` | Noise/EQ/reverb/volume on audio | `--noise 0.3 --volume 1.2` |
| `noise` | Audio FX (reverb/robot/echo…) | `--type reverb` |
| `adjust` | Brightness/contrast/saturation | `--brightness 0.05 --contrast 1.2` |
| `blur` | Blur whole/region | `--strength 8 --region 200:200:100:100` |
| `enhance` | Denoise + sharpen + deblock | — |
| `fade` | Fade in/out (video + audio) | `--fade-in 0.5 --fade-out 0.5` |
| `freeze` | Freeze a frame for N seconds | `--at 00:03 --duration 2` |
| `reverse` | Reverse playback | — |
| `stabilize` | Video stabilization (2-pass) | — |
| `chroma-key` | Green/blue screen → transparent/replace | `--color green --background bg.png` |
| `loop` | Loop clip N times | `--n 3` |
| `merge` | Join multiple videos | `--files "a.mp4,b.mp4"` |
| `convert` | **Container/codec conversion** (mp4↔webm↔mov↔mkv↔avi; mp3/wav/ogg/m4a audio) | `--output out.webm` |
| `stem-split` | **Best-effort voice/BGM split** (center-channel) | `--mode voice` (or `bgm`) |
| `gif` | Video → animated GIF | `--fps 10 --w 480` |
| `thumbnail` | Poster frame | `--at 00:01 --w 320` |
| `extract-frame` | Single frame as PNG/JPG | `--at 00:02` |
| `info` | Show metadata | — |

**On audio separation (important):** `mute` removes ALL audio. True
**voice-only / music-only** separation from a mixed track requires an ML stem-splitter
(Demucs/Spleeter), which is **not installed** in this zero-cost build. `stem-split` is a
best-effort **center-channel** trick (`pan` filter): it removes/keeps the centered signal,
which only works when vocals are hard-centered and instruments are side-panned. For a
normal mixed stereo track it will **not** cleanly isolate voice or BGM — it merely
attenuates the center. If you need real separation, install Demucs separately (outside
this project's scope) and feed its output voice/bgm files back via `replace-audio`.

**Format conversion note:** `convert` wraps `ffmpeg-static` (libx264 / libvpx-vp9 /
libopus / aac) — no external encoder needed. WebM/VP9 is slower than MP4; allow time for
long clips.

### 22.15 Audio-only generation & voice cloning

You can generate a **real human-like voice audio file (WAV/MP3) without making a video**,
and clone a voice from a reference clip. All audio runs through the bundled speech
backend (`src/speech`), which currently uses **Kokoro** (verified working in this repo's
venv — `kokoro OK`).

**A) Voice generation (Kokoro) — audio only, no video**
The pipeline's voice stage writes standalone per-scene WAVs. To get audio without a
render, run the `plan` + `voice` stages on a job JSON:

```bash
# 1) Plan (builds the scene plan from the script)
npx tsx src/adapters/cli/agentic-modular.ts plan --file input/scripts/my-job.json
# 2) Voice only (Kokoro generates a .wav per scene → workspace/jobs/<id>/audio/)
npx tsx src/adapters/cli/agentic-modular.ts voice --file <job>.json
```
Output: `workspace/jobs/<id>/audio/scene_N_voice.wav` (24 kHz PCM, real neural voice).
Verified: a 2-line test job produced `scene_1_voice.wav` (1.95 s, 24 kHz mono) end-to-end.
Batch equivalent: `npm run agentic:batch -- --file <job>.json --mode generate-voice-voicebox`.

Voice presets (engine `kokoro`): `af_heart`, `af_bella`, `am_michael`, `am_liam`, … (see
§22.6 for the full Kokoro list and `kokoroVoice` field).

**B) Voice cloning from a reference clip**
- **Chatterbox backend** (`src/speech/backends/chatterbox_backend.py`, ResembleAI) is the
  real zero-shot **voice-clone** engine: `generate(text, voice_prompt)` takes `ref_audio`
  (your clip) and synthesizes speech in that cloned voice. It is wired in code.
- **`clone-voice` mode** (`npm run agentic:batch -- --mode clone-voice`) scans
  `input/voices/<clip>` and **saves a clone-profile JSON** for reuse in the pipeline
  (`useClonedVoiceId` in the job JSON). ⚠️ It does **NOT** output a standalone audio file
  by itself — it's "clone a profile to reuse," not "give me a WAV in my voice."
- **Limitation / honest caveat:** Chatterbox needs a model download + ML runtime and is
  **NOT verified to load in this zero-cost venv** (Kokoro is the verified path). There is
  currently **no `clone-speak`/`speak` one-liner** that takes `ref_clip + text → wav`.
  If you need true cloned-audio files, either (a) install Chatterbox separately and feed
  its output via `replace-audio`, or (b) ask to have a `clone-speak` command added
  (reference clip + text → standalone WAV, falling back to Kokoro when Chatterbox is
  unavailable).

**Summary**

| Capability | Status |
| :--------- | :----- |
| Human-like voice → WAV/MP3 (no video) | ✅ Kokoro (verified) |
| Clone voice FROM an audio file (engine) | ⚠️ Chatterbox present in code, unverified in env |
| Standalone cloned-audio file (ref + text → wav) | ❌ No command yet (`clone-voice` saves profile only) |
| Reuse cloned voice inside the video pipeline | ✅ via `useClonedVoiceId` |

### 22.16 Standalone Audio Editor (`agentic:audio`) + Video gaps

The speech backend only **generates** voice — it had no editor for existing audio
files. That gap is now closed by a dedicated **audio toolbox** (`src/adapters/cli/
agentic-audio.ts`, `npm run agentic:audio`), plus three missing video-editor
commands. All verified against the bundled `ffmpeg-static`.

**Audio toolbox — `npm run agentic:audio <command> -- --input <file>`**

| Command | What it does | Key options |
| :------ | :---------- | :---------- |
| `trim` | Cut a segment | `--start 0 --duration 1.5` (or `--end 2`) |
| `merge` | Join N audio files | `--files "a.wav,b.wav"` |
| `fade` | Fade in/out | `--fade-in 0.5 --fade-out 0.5 --end <total>s` |
| `normalize` | Loudness normalize (loudnorm) | `--lufs -14` |
| `noise` | Noise reduction (anlmdn) | `--amount 8` |
| `speed` | Playback speed (0.25×–4×+, atempo) | `--rate 1.5` |
| `pitch` | Pitch shift w/o tempo change (rubberband) | `--semitones 3` |
| `info` | Show audio metadata | — |

**Video-editor additions (`npm run agentic:editor`)**

| Command | What it does | Key options |
| :------ | :---------- | :---------- |
| `subtitle` | **Burn an `.srt`/`.ass` file** onto video | `--file subs.srt --style "FontSize=24,..."` |
| `transition` | **Cross-fade between two clips** (xfade+acrossfade) | `--a c1.mp4 --b c2.mp4 --type fade --duration 0.8 --offset 1.2` |
| `normalize-audio` | Loudness-normalize a video's audio track | `--lufs -14` |

**Notes (verified):** `transition` requires both clips share resolution/codec-ish
properties; it re-encodes to H.264/AAC. `subtitle` style uses ASS `force_style`
syntax. `pitch` auto-falls back to `asetrate`+`aresample` if `rubberband` isn't in
the ffmpeg build (tempo shifts slightly in fallback mode). All commands are pure
ffmpeg wrappers — no external deps, zero-cost.

```bash
# Standalone audio editing examples
npm run agentic:audio trim   --input vo.wav --start 0 --duration 5 --output clip.wav
npm run agentic:audio merge  --files "intro.wav,main.wav,outro.wav" --output full.wav
npm run agentic:audio fade   --input vo.wav --fade-in 0.5 --fade-out 1 --end 8 --output vf.wav
npm run agentic:audio normalize --input vo.wav --lufs -14 --output norm.wav
npm run agentic:audio noise  --input vo.wav --amount 10 --output clean.wav
npm run agentic:audio speed  --input vo.wav --rate 0.8 --output slow.wav
npm run agentic:audio pitch  --input vo.wav --semitones -2 --output lower.wav

# Video gap fills
npm run agentic:editor subtitle --input reel.mp4 --file captions.srt --output reel_sub.mp4
npm run agentic:editor transition --a a.mp4 --b b.mp4 --type fade --duration 1 --offset 2 --output joined.mp4
npm run agentic:editor normalize-audio --input reel.mp4 --lufs -14 --output reel_norm.mp4
```

### 22.17 Remaining gap-fill commands (verified this pass)

The last gaps across all three toolboxes were closed — every command below was
built, **typechecked**, and **verified with real ffmpeg output** (and visually
inspected where applicable).

**Audio (`npm run agentic:audio`) — added: `convert`, `reverse`, `reverb`, `echo`, `equalize`**
| Command | What it does | Key options |
| :------ | :---------- | :---------- |
| `convert` | wav/mp3/ogg/flac/m4a conversion | `--output out.mp3` |
| `reverse` | Play audio backwards | — |
| `reverb` | Add reverberation (aecho) | `--delays 60 --decays 0.5` |
| `echo` | Simple echo | `--delay 500 --decay 0.5` |
| `equalize` | 3-band EQ | `--bass 4 --mid 0 --treble 2` |

**Image (`npm run agentic:image`) — added: `grayscale`, `sepia`, `pixelate`, `slideshow`**
| Command | What it does | Key options |
| :------ | :---------- | :---------- |
| `grayscale` | Desaturate to B&W | — |
| `sepia` | Warm vintage tone | — |
| `pixelate` | Mosaic / pixel-art | `--blocks 30` |
| `slideshow` | Multiple images → timed video w/ crossfade | `--files "a.png,b.png" --duration 2 --w 1080 --h 1920` |

**Video (`npm run agentic:editor`) — added: `duck`, `lut`, `speed-ramp`**
| Command | What it does | Key options |
| :------ | :---------- | :---------- |
| `duck` | Lower BGM under a voice track (sidechain) | `--music bg.wav --voice vo.wav` |
| `lut` | Color grade (`.cube` file or built-in cinematic preset) | `--cube grade.cube` (omit = preset) |
| `speed-ramp` | Variable speed (slow→fast at fraction) | `--start 0.5 --end 2 --at 0.5` |

**Verified notes:** `slideshow` loops each image (`-loop 1`) so `trim=duration` works;
`duck` outputs PCM WAV; `lut` with no `--cube` applies a teal-orange `colorbalance`
preset (no external file needed); `speed-ramp` splits into 2 `trim`+`setpts` segments
and `concat`s them. All pure ffmpeg — zero-cost, no ML.

**Final single-asset coverage:** image (22 cmds), video (39 cmds), audio (13 cmds).
The only still-missing items are ML-dependent: **AI upscale** (needs Real-ESRGAN)
and **auto-captions** (needs Whisper) — both excluded by the zero-cost constraint.

