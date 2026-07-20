# Visual Assets Guide

This document describes all visual assets needed for the Automated Video Generator repository, including where they should be placed and what they should contain.

---

## Asset Inventory

| Asset | File Path | Purpose | Dimensions | Status |
|-------|-----------|---------|------------|--------|
| Logo | `assets/logo.svg` | Repository logo, docs site | 512×512 | ✅ Exists |
| Logo (automation theme) | `assets/logo-automation.png` | README display | 200×200 | ✅ Exists |
| Logo (creative theme) | `assets/logo-creative.png` | Alternative branding | 200×200 | ✅ Exists |
| Hero banner | `assets/hero-banner.png` | README top hero section | 1200×600 | ❌ Placeholder |
| Hero banner (dark) | `assets/hero-banner-dark.png` | Dark mode variant | 1200×600 | ❌ Placeholder |
| Social preview | `assets/github-social-preview.svg` | GitHub social share card | 1280×640 | ✅ Exists |
| Demo thumbnail | `assets/demo-thumbnail.png` | YouTube demo link preview | 1280×720 | ✅ Exists |
| Workflow GIF | `assets/workflow-demo.gif` | Terminal recording of workflow | 800×600 (optimized) | ❌ Placeholder |
| Architecture diagram | `assets/architecture.svg` | Architecture overview | 800×600 | ❌ Placeholder |
| Feature illustrations | `assets/features/` | Per-feature illustrations | 400×300 each | ❌ Not created |
| Tray icon | `assets/tray-icon.png` | Electron system tray | 32×32 | ✅ Exists |
| App icon | `assets/icon.ico` | Windows app icon | 256×256 | ✅ Exists |
| Favicon | `public/favicon.ico` | Web portal favicon | 32×32 | ✅ Exists |

---

## Asset Specifications

### Hero Banner (`assets/hero-banner.png`)

**Design direction:**
- Dark gradient background (deep blue/purple to dark)
- Pipeline flow visualization: Text → Voiceover → Stock Media → Remotion → MP4
- Use bright accent colors (cyan, green) for the flow arrows
- Clean, minimal, tech-forward aesthetic
- Text overlay: "Automated Video Generator" + "Free · Open Source · Self-Hosted"

**Same for dark variant** (`assets/hero-banner-dark.png`) with darker tones.

### Architecture Diagram (`assets/architecture.svg`)

**Design direction:**
- Hexagonal layers visualization
- Top layer: Runtimes (HTTP, CLI, MCP, Electron)
- Middle layer: Application Services
- Bottom layer: Lib, Infrastructure, Shared
- Arrows showing request flow
- Color-coded by layer

### Workflow GIF (`assets/workflow-demo.gif`)

**Tools to create:**
- [VHS](https://github.com/charmbracelet/vhs) — declarative terminal GIFs
- [asciinema](https://asciinema.org/) + [agg](https://github.com/asciinema/agg)

**Content:**
1. Show editing `input/input-scripts.json`
2. Run `npm run generate`
3. Show progress output
4. Open `output/` directory with resulting MP4
5. Duration: 15-20 seconds
6. Max file size: 3-5 MB

### Feature Illustrations (`assets/features/`)

Create individual PNG/SVG illustrations for:
- `assets/features/voiceovers.svg` — Voice synthesis illustration
- `assets/features/stock-media.svg` — Stock media fetching
- `assets/features/batch-processing.svg` — Batch generation
- `assets/features/mcp-integration.svg` — MCP/AI agent support
- `assets/features/web-portal.svg` — Web portal UI

---

## Creating Assets

### Option 1: Design from Scratch

Use [Figma](https://figma.com), [Inkscape](https://inkscape.org) (free), or [Penpot](https://penpot.app) (free, open-source) to create vector assets.

### Option 2: AI-Generated

Use tools like:
- [Recraft.ai](https://recraft.ai) — vector illustration generation
- [DALL·E](https://openai.com/dall-e) / [Midjourney](https://midjourney.com) — raster images
- [SVG.io](https://svg.io) — SVG generation
- [Stable Diffusion](https://stability.ai) — with appropriate LoRAs

### Option 3: Terminal Recording for GIF

```bash
# Using VHS
# 1. Create a .tape file (see example below)
# 2. Run: vhs assets/workflow-demo.tape
```

Example VHS tape file:

```tape
Output assets/workflow-demo.gif
Set FontSize 16
Set Width 800
Set Height 600
Set Padding 32
Type "cat input/input-scripts.json"
Sleep 2s
Type "npm run generate"
Sleep 5s
Type "ls -la output/my-video/"
Sleep 2s
```

---

## Adding New Assets

1. Create the asset file
2. Place in the `assets/` directory
3. Reference from `README.md` or documentation
4. Update this guide

---

## Image Optimization

| Format | Tool | Command |
|--------|------|---------|
| PNG | `pngquant` | `pngquant --quality=80 --output out.png -- input.png` |
| SVG | `svgo` | `npx svgo assets/architecture.svg` |
| GIF | `gifsicle` | `gifsicle -O3 --lossy=80 -o optimized.gif input.gif` |
| JPEG | `jpegtran` | `jpegtran -optimize -copy none -outfile out.jpg input.jpg` |
