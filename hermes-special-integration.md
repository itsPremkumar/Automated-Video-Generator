# 🤖 Hermes Special Integration — Asset Capture for Video Pipeline

> **Use Hermes Agent's browser & desktop capture capabilities to collect real screenshots, window captures, and web page assets — then feed them directly into the Automated Video Generator pipeline.**

---

## 🎯 What This Enables

Instead of manually gathering images, Hermes can:

| Capability | What It Captures | How It Feeds the Video |
|------------|-----------------|------------------------|
| 🌐 **Browser Navigation** | Any live webpage (GitHub, docs, dashboards) | Screenshot → `input/visuals/` → `[Visual: file.png]` |
| 🖥️ **Desktop/Window Capture** | Any running app (VS Code, Terminal, File Explorer) | Screenshot → `input/visuals/` → `[Visual: app.png]` |
| 🎨 **Custom HTML Rendering** | Branded title cards, infographics, code showcases | HTML → Browser Screenshot → `input/visuals/` → `[Visual: card.png]` |

---

## 🧰 The Tool Chain

### 1. Browser Screenshots (`browser_navigate` + `browser_vision`)

```
browser_navigate("https://github.com/user/repo")
       ↓
browser_vision(question="Full page screenshot", annotate=false)
       ↓
Returns: { screenshot_path: "C:/cache/screenshots/github.png" }
       ↓
cp → input/visuals/github-profile.png
       ↓
Script: "[Visual: github-profile.png] My repo overview"
```

**Parameters:**

| Param | Value | Effect |
|-------|-------|--------|
| `question` | `"Take a full page screenshot"` | Captures the visible viewport |
| `annotate: true` | — | Overlays numbered labels on interactive elements (for subsequent click/type) |
| `annotate: false` | — | Clean screenshot — no overlays, raw page |

**For long pages**, scroll and capture multiple sections:

```
browser_navigate(url)
browser_vision()                   # Screenshot 1 — above the fold
browser_scroll(direction="down")   # Scroll down
browser_vision()                   # Screenshot 2 — next section
browser_scroll(direction="down")
browser_vision()                   # Screenshot 3 — bottom
```

### 2. Desktop/Window Capture (`computer_use capture`)

```
computer_use capture(app="Code", mode="vision")
       ↓
Returns screenshot of VS Code window
       ↓
cp → input/visuals/vscode-code.png
       ↓
Script: "[Visual: vscode-code.png] Here's the code"
```

**Capture modes:**

| Mode | Description | Output |
|------|-------------|--------|
| `mode="som"` | Screenshot with **numbered overlays** on every clickable element — best for subsequent clicks | PNG + AX tree |
| `mode="vision"` | **Clean screenshot** — no overlays, just the raw visual | PNG |
| `app="Code"` | Limit capture to a **specific app window** (VS Code, Chrome, Terminal, etc.) | Cropped to window |
| `app="screen"` | Capture the **full desktop** with all open windows | Full monitor |

**Target specific apps:**

```
computer_use capture(app="Code")          # VS Code — show your project code
computer_use capture(app="Chrome")        # Chrome — show a webpage
computer_use capture(app="Windows Terminal")  # Terminal — show CLI output
computer_use capture(app="explorer")      # File Explorer — show project structure
computer_use capture(app="screen")        # Entire desktop — show everything
```

### 3. Custom HTML Title Cards (Branded Assets)

Hermes writes custom HTML, opens it in the browser, and screenshots it:

```
write_file("input/visuals/card.html", "<html>branded content...</html>")
       ↓
browser_navigate("file:///path/to/card.html")
       ↓
browser_vision() → screenshot
       ↓
cp → input/visuals/title-card.png
```

**Example HTML for a portrait (9:16) title card:**

```html
<html>
<body style="background:linear-gradient(135deg,#667eea,#764ba2);
             width:1080px;height:1920px;
             display:flex;align-items:center;justify-content:center;
             font-family:sans-serif;color:white;text-align:center;">
  <div>
    <img src="input/visuals/logo-automation.png" width="300">
    <h1 style="font-size:80px;margin:40px 0;">My Video Title</h1>
    <p style="font-size:40px;opacity:0.8;">by Premkumar M</p>
  </div>
</body>
</html>
```

---

## 📁 Asset Storage: `input/visuals/`

All captured assets go into the same directory:

```
input/visuals/
├── logo-automation.png         ← manually placed
├── github-profile.png          ← browser capture
├── vscode-code.png             ← desktop capture
├── title-card.png              ← custom HTML capture
├── contribution-graph.png      ← browser capture (scrolled)
└── ...any other assets
```

> **Fallback behavior:** If a `[Visual: filename.png]` file does **not exist** in `input/visuals/`, the system treats the text as **keywords** and searches stock media (Pexels → Pixabay → Free Sources). So `[Visual: logo.png]` = your asset, `[Visual: nature forest]` = stock footage.

---

## 🎬 Using Captured Assets in Video Scripts

### Legacy Pipeline (`input/scripts/input-scripts.json`)

```json
[
  {
    "id": "my-video",
    "title": "My Video Title",
    "script": "Meet the project. [Visual: title-card.png]\nHere's the GitHub. [Visual: github-profile.png]\nWith real code. [Visual: vscode-code.png]\nOpen source and free. [Visual: license-badge.png]",
    "orientation": "portrait",
    "voice": "en-US-GuyNeural"
  }
]
```
Run: `npm run generate`

### Agentic Pipeline (`input/scripts/agentic-scripts.json`)

```json
[
  {
    "id": "my-agentic-video",
    "title": "My Agentic Video",
    "script": "Meet the project. [Visual: title-card.png]\nHere's the GitHub. [Visual: github-profile.png]\nWith 21 stars. [Visual: stars-graph.png]\nBuilt with AI. [Visual: ai-coding]",
    "orientation": "portrait",
    "hookFirst": true,
    "variablePacing": true,
    "backend": "agent"
  }
]
```
Run: `npm run generate:agentic`

---

## 🔍 How the Pipeline Resolves Local Assets

From `src/video-generator.ts` (legacy) and `src/agentic/orchestrator/pipeline.ts` (agentic):

```typescript
if (scene.localAsset) {
    const sourcePath = path.join(inputAssetPath(), scene.localAsset);
    const isVideo = ['.mp4', '.mov', '.webm', '.m4v'].includes(ext);

    if (fs.existsSync(sourcePath)) {
        // File exists → USE LOCAL ASSET directly
        visual = {
            type: isVideo ? 'video' : 'image',
            url: `local://${scene.localAsset}`,
            localPath: toPublicRelativePath(targetPath),
        };
    } else {
        // File NOT found → use text as STOCK MEDIA keywords
        scene.searchKeywords = scene.localAsset;
        scene.localAsset = undefined;
    }
}
```

The agentic pipeline adds a guard: if a `[Visual: ...]` tag already set `localAsset`, the auto-detect loop **skips** that scene (no overwriting). See `pipeline.ts` lines 115-135.

---

## 🚀 Complete Workflow: Capture → Video

### One-Shot Capture & Generate

```
1. CAPTURE
   ├── browser_navigate("https://github.com/itsPremkumar")
   │   └── browser_vision() → input/visuals/github-profile.png
   ├── computer_use capture(app="Code") → input/visuals/vscode-code.png
   └── Write HTML title card → screenshot → input/visuals/title-card.png

2. SCRIPT
   └── Edit input/scripts/agentic-scripts.json
       └── "[Visual: title-card.png] ... [Visual: github-profile.png] ..."

3. GENERATE
   └── npm run generate:agentic
       ├── Voicebox/Kokoro realistic audio (from .env)
       ├── 6 quality gates
       ├── 25+ post-render plugins
       └── Multi-aspect export (16:9, 1:1, 9:16)

4. OUTPUT
   └── output/avs_agentic_reel/
       ├── video.mp4 (main)
       ├── video_16x9.mp4
       ├── video_1x1.mp4
       ├── video_9x16.mp4
       ├── video_subtitles.srt
       ├── video_subtitles.vtt
       ├── video_thumbnail.jpg
       ├── video_youtube_upload.sh
       └── archive/ (all publish artifacts)
```

### Multi-Capture Batch

For a richer video, capture multiple assets across different sources:

```bash
# Capture flow
1. browser_navigate("https://github.com/itsPremkumar/Automated-Video-Generator")
   browser_vision() → save as repo-top.png
   browser_scroll(down) → browser_vision() → save as repo-mid.png

2. computer_use capture(app="Code") → save as code-editor.png
   computer_use capture(app="Windows Terminal") → save as terminal-run.png

3. write_file("brand-card.html", HTML template)
   browser_navigate("brand-card.html")
   browser_vision() → save as title-card.png

# Script references ALL of them
"script": "[Visual: title-card.png]\nBuilt with TypeScript.\n[Visual: code-editor.png]\nRun from the CLI.\n[Visual: terminal-run.png]\nOn GitHub with 21 stars.\n[Visual: repo-top.png]"
```

---

## 🌐 Real-World Use Cases

| Use Case | Target URL / App | Captured Asset | Video Type |
|----------|-----------------|----------------|------------|
| **GitHub repo reel** | `github.com/user/repo` | Stars, README, pinned repos | Promo / Showcase |
| **Product landing page** | `product.com` | Homepage hero section | Marketing |
| **Dashboard metrics** | `dashboard.example.com` | Live analytics | Demo |
| **VS Code walkthrough** | `computer_use capture(app="Code")` | Code in editor | Tutorial |
| **CLI demo** | `computer_use capture(app="Terminal")` | Running commands | Developer content |
| **Title card** | Custom HTML | Branded intro/outro | All videos |
| **Documentation site** | `docs.example.com` | API docs / getting started | Educational |

---

## 📊 Capture Methods Quick Reference

| Method | Tool | Clean Screenshot? | Resolution | Interaction? |
|--------|------|-------------------|------------|-------------|
| **Browser screenshot** | `browser_vision(annotate=false)` | ✅ Yes — raw page | Full viewport | Navigate/scroll before capture |
| **Browser annotated** | `browser_vision(annotate=true)` | ❌ Numbered overlays | Full viewport | Click elements after capture |
| **Desktop (SOM)** | `computer_use capture(mode="som")` | ❌ Overlays + AX tree | Window size | Click elements after capture |
| **Desktop (Vision)** | `computer_use capture(mode="vision")` | ✅ Yes — raw window | Window size | Read-only, ideal for assets |
| **Full desktop** | `computer_use capture(app="screen")` | ✅ Yes | Monitor | Read-only |
| **Custom HTML** | `write_file` + `browser_navigate` | ✅ Yes | Custom (1080×1920) | Pre-designed |

---

## 💡 Tips for Best Results

1. **Aspect ratio**: Capture in 9:16 (portrait) for Shorts/Reels, 16:9 for YouTube
2. **Clean workspace**: Close irrelevant windows before desktop capture
3. **Zoom in**: For code/terminal, zoom to make text readable at video resolution
4. **Custom HTML = full control**: Perfect for branded title cards with exact colors, fonts, logo
5. **File names must match exactly**: `[Visual: my-screenshot.png]` requires `input/visuals/my-screenshot.png`
6. **Mix captured + stock**: Use real screenshots for specific content + `[Visual: keywords]` for general B-roll
7. **Batch in one session**: Capture 5-10 assets at once, then write one script referencing them all
8. **For the agentic pipeline**: The `dotenv/config` import (already in `agentic-cli.ts`) loads `.env` so Voicebox/Kokoro works automatically

---

## 📋 Validation Checklist

- [ ] Target page/app is **accessible** (public URL or running window)
- [ ] Screenshot captured via browser or desktop tool
- [ ] File copied to `input/visuals/` with clean name
- [ ] Filename matches **exactly** in `[Visual: filename.ext]` tag
- [ ] `orientation` set to `"portrait"` (9:16) or `"landscape"` (16:9)
- [ ] Script has a mix of captured assets + narration text
- [ ] Run `npm run generate` (legacy) or `npm run generate:agentic` (agentic)
- [ ] Voicebox profile set in `.env` for realistic audio (`TTS_PROVIDER=voicebox`)
- [ ] Output checked in `output/<job-id>/`

---

## 📂 File Structure Summary

```
project-root/
├── input/
│   ├── visuals/                  ← 📁 Place all captured screenshots here
│   │   ├── logo-automation.png
│   │   ├── github-profile.png
│   │   ├── vscode-code.png
│   │   └── title-card.png
│   └── scripts/
│       ├── input-scripts.json     ← Legacy pipeline jobs
│       └── agentic-scripts.json   ← Agentic pipeline jobs
├── output/                        ← Generated videos
│   ├── avs_promo_reel/
│   └── avs_agentic_reel/
├── src/
│   ├── lib/voice-generator.ts     ← Voicebox/Kokoro provider routing
│   ├── agentic/orchestrator/pipeline.ts  ← Script + asset binding
│   └── adapters/cli/agentic-cli.ts ← Agentic JSON CLI
├── .env                           ← TTS_PROVIDER=voicebox config
└── docs/
    └── CUA_ASSET_COLLECTION.md    ← Full reference guide
```

---

## 🔗 Related Documentation

- [`docs/CUA_ASSET_COLLECTION.md`](./docs/CUA_ASSET_COLLECTION.md) — Full reference with examples
- [`docs/INPUT_ASSETS_GUIDE.md`](./docs/INPUT_ASSETS_GUIDE.md) — Basic local asset usage
- [`input/scripts/INPUT_FORMAT.md`](./input/scripts/INPUT_FORMAT.md) — Script input format
- [`tools/computer-agent/README.md`](./tools/computer-agent/README.md) — CUA agent for advanced asset generation
- [`docs/VOICEBOX_SETUP.md`](./docs/VOICEBOX_SETUP.md) — Voicebox/Kokoro voiceover setup
- [`docs/agentic-pipeline/README.md`](./docs/agentic-pipeline/README.md) — Agentic pipeline architecture
