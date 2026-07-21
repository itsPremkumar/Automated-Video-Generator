---
title: CUA Asset Collection Guide — Automated Video Generator
description: How to use Hermes Agent's computer-use (CUA) capabilities to capture real screenshots, window captures, and web page assets for your video pipeline.
---

# CUA Asset Collection Guide

> **Leverage Hermes Agent's desktop capture capabilities to automatically collect real visual assets — screenshots, app windows, web pages — and feed them directly into your video generation pipeline.**

## 📋 Overview

The Automated Video Generator supports two ways to get visual assets into your videos:

| Method | Description | When to Use |
|--------|-------------|-------------|
| **📁 Local Files** (`input/visuals/`) | Manually place images/videos in folder | You already have the assets |
| **🔍 Stock Keywords** (`[Visual: search terms]`) | Auto-download from Pexels/Pixabay | You need generic stock footage |
| **🖥️ CUA Capture** (NEW!) | Hermes drives your desktop to capture real screenshots | You want **real, specific, live** content |

CUA (Computer-Use Agent) lets Hermes see your screen and capture exactly what you need — your code editor, your GitHub profile, your running app — and save it as a video asset.

---

## 🎯 What You Can Capture

### 1. Web Pages (Browser Screenshots)

Hermes navigates to any URL and captures a full-page screenshot.

```
┌─────────────────────────────────────────┐
│  browser_navigate('github.com/user')    │
│         ↓                               │
│  browser_vision() → screenshot.png      │
│         ↓                               │
│  Copy to input/visuals/                 │
│         ↓                               │
│  [Visual: github-profile.png] in script │
└─────────────────────────────────────────┘
```

**Use cases:**
- Your GitHub profile → video intro showcasing your work
- Your repo README → feature demos with real content
- Documentation pages → tutorial-style videos
- Live dashboards → analytics showcases
- AI tools (HuggingFace Spaces, ChatGPT) → generated images as assets

### 2. Desktop Windows (App Screenshots)

Hermes sees any running application on your desktop and captures exactly what's on screen.

```
┌─────────────────────────────────────────┐
│  computer_use capture(app='Code')       │
│         ↓                               │
│  Screenshot of VS Code with your code   │
│         ↓                               │
│  Copy to input/visuals/                 │
│         ↓                               │
│  [Visual: vscode-code.png] in script    │
└─────────────────────────────────────────┘
```

**Use cases:**
- VS Code showing your project → developer-focused videos
- File Explorer with project structure → architecture overviews
- Terminal showing CLI output → command demo videos
- Media player with your video → preview/teaser content
- Any running application → software demo videos

### 3. Custom HTML (Branded Assets)

Hermes writes custom HTML/CSS, opens it in the browser, and screenshots it.

```
┌─────────────────────────────────────────┐
│  write_file('card.html', '<html>...</>')│
│         ↓                               │
│  browser_navigate('card.html')          │
│         ↓                               │
│  browser_vision() → title-card.png      │
│         ↓                               │
│  [Visual: title-card.png] in script     │
└─────────────────────────────────────────┘
```

**Use cases:**
- Branded title cards with your logo
- Feature comparison tables
- Code showcase with syntax highlighting
- Statistics/infographics
- Call-to-action overlays

---

## 📁 The Workflow: Capture → Video

### Step 1: Capture

Hermes captures the target and saves it:

```bash
# Browser capture
browser_navigate('https://github.com/your-profile')
browser_vision() → captures screenshot

# Desktop capture
computer_use capture(app='Code') → captures VS Code window

# Custom HTML capture
write_file('capture.html', '...styled content...')
browser_navigate('file://capture.html')
browser_vision() → captures title card
```

### Step 2: Save to `input/visuals/`

All captured files go to `input/visuals/` — the same folder the pipeline reads from:

```
input/visuals/
├── logo-automation.png        ← your existing logo
├── github-profile.png         ← captured browser screenshot
├── vscode-code.png            ← captured VS Code window
├── title-card.png             ← captured custom HTML
├── contribution-graph.png     ← captured from GitHub
└── ...any other captures
```

### Step 3: Reference in Script

Use `[Visual: filename.ext]` tags — exactly like local assets:

```json
{
  "script": "Meet the Automated Video Generator. [Visual: title-card.png]\nBuilt by Premkumar M. [Visual: github-profile.png]\nWith 21 stars on GitHub. [Visual: contribution-graph.png]\nOpen source and free. [Visual: license-badge.png]"
}
```

### Step 4: Generate Video

```bash
# Legacy pipeline
npm run generate

# Agentic pipeline (with Voicebox audio, gates, plugins)
npm run generate:agentic
```

---

## 🧪 Practical Examples

### Example 1: GitHub Profile Promo Video

**Capture phase:**
```
1. browser_navigate('https://github.com/itsPremkumar')
2. browser_vision() → save as 'github-profile.png'
3. Scroll down → browser_vision() → save as 'contrib-graph.png'
4. browser_navigate('https://github.com/itsPremkumar/Automated-Video-Generator')
5. browser_vision() → save as 'repo-readme.png'
```

**Script (`agentic-scripts.json`):**
```json
[
  {
    "id": "github-showcase",
    "title": "My GitHub Portfolio",
    "script": "Hi, I'm Premkumar M. [Visual: title-card.png]\nI build AI video pipelines. [Visual: github-profile.png]\nMy project has 21 stars. [Visual: repo-readme.png]\nWith 4,600+ contributions. [Visual: contrib-graph.png]\nAll open source and free. [Visual: mit-license.png]",
    "orientation": "portrait",
    "hookFirst": true,
    "variablePacing": true,
    "backend": "agent"
  }
]
```

### Example 2: VS Code Demo Video

**Capture phase:**
```
1. computer_use capture(app='Code') → save as 'vscode-code.png'
2. Open terminal → computer_use capture(app='Windows Terminal') → save as 'terminal-cli.png'
3. Open Chrome with docs → browser_vision() → save as 'docs-website.png'
```

**Script:**
```json
[
  {
    "id": "code-demo",
    "title": "Building with Automated Video Generator",
    "script": "Here's my project in VS Code. [Visual: vscode-code.png]\nRunning the CLI. [Visual: terminal-cli.png]\nWith full documentation. [Visual: docs-website.png]\nTry it yourself today. [Visual: rocket-launch]",
    "orientation": "landscape",
    "backend": "agent"
  }
]
```

### Example 3: Custom Branded Title Card

**Capture phase:**
```html
<!-- Hermes writes this HTML, opens it, screenshots it -->
<html>
<body style="background:linear-gradient(135deg,#667eea,#764ba2);
             width:1080px; height:1920px;
             display:flex; align-items:center; justify-content:center;
             font-family:sans-serif; color:white; text-align:center;">
  <div>
    <img src="input/visuals/logo-automation.png" width="300">
    <h1 style="font-size:80px; margin:40px 0;">My Video Title</h1>
    <p style="font-size:40px; opacity:0.8;">by Premkumar M</p>
  </div>
</body>
</html>
```

```
browser_navigate('title-card.html')
browser_vision() → save as 'title-card.png'
```

---

## 🔄 Integration with Both Pipelines

### Legacy Pipeline (`input/scripts/input-scripts.json`)

```json
[
  {
    "script": "My video. [Visual: captured-asset.png]",
    "voice": "en-US-GuyNeural",
    "orientation": "portrait"
  }
]
```
Run: `npm run generate`

### Agentic Pipeline (`input/scripts/agentic-scripts.json`)

```json
[
  {
    "script": "My video. [Visual: captured-asset.png]",
    "voice": "en-US-GuyNeural",
    "hookFirst": true,
    "backend": "agent"
  }
]
```
Run: `npm run generate:agentic`

Both use the same `[Visual: filename.ext]` syntax. The agentic pipeline adds gates, plugins, Voicebox audio, and multi-aspect export.

---

## 📊 Capture Methods Comparison

| Capture Method | Tool Used | Output | Resolution | Best For |
|---------------|-----------|--------|------------|----------|
| **Browser screenshot** | `browser_vision()` | PNG | Full page | Web content, GitHub, docs |
| **Desktop window** | `computer_use capture()` | PNG | Window size | Apps, editors, terminals |
| **Full desktop** | `computer_use capture(app='screen')` | PNG | Monitor resolution | Multiple apps, workflows |
| **Custom HTML** | `write_file()` + `browser_navigate()` | PNG | Custom (1080×1920) | Title cards, infographics |

---

## 💡 Tips for Best Results

1. **Aspect Ratio Match**: Capture in 9:16 (portrait) for Reels/Shorts, 16:9 for YouTube
2. **Clean Your Screen**: Close irrelevant windows before capture
3. **Zoom In**: For code/terminal captures, zoom to make text readable
4. **Custom HTML = Full Control**: Use it for branded title cards with exact colors, fonts, and logo placement
5. **Mix with Stock**: Use captured assets for specific content + `[Visual: keywords]` for general footage
6. **Batch Capture**: Capture multiple assets in one session, then write one script referencing them all

---

## 🚀 Complete End-to-End Example

```
Step 1: Capture assets
  → browser_navigate('https://github.com/itsPremkumar')
  → browser_vision() → save to input/visuals/github-profile.png
  
  → browser_navigate('https://github.com/itsPremkumar/Automated-Video-Generator')  
  → browser_vision() → save to input/visuals/repo-page.png
  
  → Write and capture custom HTML title card
  → save to input/visuals/title-card.png

Step 2: Write script  
  → Edit input/scripts/agentic-scripts.json
  → Script references all 3 captured assets

Step 3: Generate video
  → npm run generate:agentic
  → Voicebox Kokoro audio, 6 quality gates, 25+ plugins
  → Output: output/agentic-reel/ (MP4 + SRT + thumbnails + multi-aspect)

Step 4: Deliver
  → output/ contains ready-to-publish video
  → YouTube upload script auto-generated
  → Archive with publish manifest
```

---

## 🔗 Related Documentation

- [`INPUT_ASSETS_GUIDE.md`](./INPUT_ASSETS_GUIDE.md) — Basic local asset usage
- [`INPUT_FORMAT.md`](../input/scripts/INPUT_FORMAT.md) — Script input format reference
- [`tools/computer-agent/README.md`](../tools/computer-agent/README.md) — CUA agent details
- [`docs/agentic-pipeline/README.md`](./agentic-pipeline/README.md) — Agentic pipeline architecture
- [`VOICEBOX_SETUP.md`](./VOICEBOX_SETUP.md) — Realistic voiceover setup
