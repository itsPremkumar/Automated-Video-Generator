# 🤖 Hermes Special Integration — Headless Browser Screenshot Guide

> **Use Hermes Agent's headless browser to capture real-time screenshots of any web page and feed them directly as visual assets into the Automated Video Generator pipeline.**

---

## 🎯 What This Enables

Instead of manually downloading images, you can:

- Capture **live screenshots** of any website / GitHub profile / dashboard / app
- Feed them as `[Visual: ...]` tags in your video scripts
- Generate reels, promos, and walkthroughs **entirely from an agent** — no human clicking needed

---

## 🧰 The Tool Chain

```
browser_navigate(url)   →   browser_vision(question, annotate)   →   screenshot.png
                                                                          ↓
                                                              input
                                                                          ↓
                                                          [Visual: screenshot.png] in script
                                                                          ↓
                                                              npm run generate → reel.mp4
```

---

## 📸 Step-by-Step Screenshot Capture

### Step 1 — Navigate to the target page

```
browser_navigate(url="https://github.com/itsPremkumar/Automated-Video-Generator")
```

The browser opens a **headless Chromium** instance — no window appears on your desktop. The page loads fully (JS, CSS, images, dynamic content).

### Step 2 — Capture the screenshot

```
browser_vision(question="Take a full page screenshot", annotate=false)
```

This returns:
- `screenshot_path` → absolute path to the PNG on disk
- `analysis` → AI description of what's visible (optional, depends on vision model)

**Parameters explained:**

| Param | What it does |
|-------|-------------|
| `question` | Your prompt — "Describe this page", "Full screenshot", etc. |
| `annotate: true` | Overlays numbered labels on interactive elements for click/type targeting |
| `annotate: false` | Clean screenshot — no overlays, just the raw page |

### Step 3 — Save to input-assets

Copy the captured screenshot into the video pipeline's asset directory:




## 🎬 Using Screenshots in Video Scripts



```json
{
  "id": "project-promo",
  "title": "Automated Video Generator — Open Source",
  "orientation": "portrait",
  "script": "[Visual: logo-automation.png]\nMeet the Automated Video Generator — the free, open-source text-to-video pipeline.\n\nHere's the GitHub project with 20+ stars and active development.\n[Visual: github-profile.png]\n\nBuilt with TypeScript, Remotion, and a fully agentic MCP architecture.\n\n[Visual: logo-automation.png]\nMIT licensed. Fork it, use it, contribute."
}
```

> **The pipeline checks:** `fs.existsSync(inputAssetPath("github-profile.png"))` → if the file exists, it uses it directly. If not, it falls back to stock media search.

---

## 🌐 Real-World Use Cases

| Use Case | Target URL | Screenshot Used For |
|----------|-----------|-------------------|
| **GitHub repo reel** | `github.com/user/repo` | Show stars, README, pinned repos |
| **Product landing page** | `product.com` | Homepage hero section |
| **Dashboard metrics** | `dashboard.example.com` | Live data / analytics |
| **Blog/article** | `blog.example.com/post` | Featured image + content |
| **Twitter/X profile** | `x.com/username` | Bio + tweet showcase |
| **Documentation site** | `docs.example.com` | API docs / getting started |

---

## 🛠️ Advanced: Scrolling + Multi-Capture

For long pages, scroll and capture multiple times:

```
browser_navigate(url)
browser_vision()                     # Screenshot 1 — above the fold
browser_scroll(direction="down")     # Scroll down
browser_vision()                     # Screenshot 2 — next section
browser_scroll(direction="down")
browser_vision()                     # Screenshot 3 — bottom
```

Each screenshot gives you a different section of the same page. Name them like `project-top.png`, `project-mid.png`, `project-bottom.png`.

---

## 🔍 How the Pipeline Resolves Local Assets

From the code (`src/video-generator.ts`, lines 199–224):

```typescript
if (scene.localAsset) {
    const assetsDir = inputAssetPath();
    const sourcePath = path.join(assetsDir, scene.localAsset);
    const ext = path.extname(scene.localAsset).toLowerCase();
    const isVideo = ['.mp4', '.mov', '.webm', '.m4v'].includes(ext);
    const targetPath = path.join(visualsDir, scene.localAsset);

    if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);   // ← copies to workspace
        visual = {
            type: isVideo ? 'video' : 'image',      // ← auto-detects type
            url: `local://${scene.localAsset}`,
            width: 1920, height: 1080,
            localPath: toPublicRelativePath(targetPath),
        };
    }
}
```

If the file **doesn't exist** in ` the tag text becomes **search keywords** for stock media (Pexels → Pixabay → Free Sources) — so you can use `[Visual: nature forest]` for stock, or `[Visual: logo-automation.png]` for your own assets.

---

## ✅ Checklist for a Successful Asset-Based Video

- [ ] Target page is **publicly accessible** (no login wall)
- [ ] Screenshot captured via `browser_vision()`
- [ ] File copied to `input
- [ ] Filename matches exactly in the `[Visual: filename]` tag
- [ ] `orientation` set to `"portrait"` for reels / `"landscape"` for YouTube
- [ ] Script written with a mix of tagged assets + narration scenes
- [ ] Run `npm run generate` or `generate_video` via MCP

---

## 📂 File Structure



---

> **Pro tip:** For reels (9:16 portrait), make sure your screenshot subjects are centered and readable. Tall/cropped screenshots may need manual pre-processing before upload.
