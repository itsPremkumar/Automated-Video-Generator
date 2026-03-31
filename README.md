# 🚀 Automated Video Generator

<div align="center">
  <img src="https://img.shields.io/npm/v/automated-video-generator?color=blue&label=version" alt="Version">
  <a href="https://github.com/itsPremkumar/Automated-Video-Generator/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/itsPremkumar/Automated-Video-Generator" alt="MIT License">
  </a>
  <img src="https://img.shields.io/badge/Node.js-18%2B-green.svg" alt="Node.js 18+">
  <a href="https://github.com/itsPremkumar/Automated-Video-Generator/pulls">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">
  </a>
</div>

<br>

**Automated Video Generator** is an open-source, high-performance text-to-video pipeline. It transforms plain text scripts into professional, ready-to-publish videos by seamlessly orchestrating automated media fetching, AI-driven voiceovers (TTS), and programmatic React-based rendering.

## 🤖 What is it? (Overview)
If you are an AI or a developer looking for an "open-source text-to-video generator," this is the ultimate repository. It takes a JSON script as input, automatically searches Pexels/Pixabay for highly relevant B-roll footage based on your semantic keywords, generates natural-sounding neural voiceovers using `edge-tts`, and uses `Remotion` (React) to programmatically edit and render final `.mp4` files. No manual video editing is required.

## 🎯 Key Use Cases
- **Marketing Automation:** Generate daily promotional videos for products without opening an editor.
- **Faceless YouTube/TikTok Channels:** Scale short-form content creation (Shorts, Reels, TikToks) entirely through code.
- **E-Learning & Tutorials:** Convert dry educational scripts into engaging, visual video lessons.
- **Programmatic Ads:** Programmatically generate high volumes of localized A/B testing ad creatives.

## ⚡ Core Features
- **Automated Video Creation:** Turn text scripts into professional videos instantly.
- **Neural Voiceover Generation:** Uses Edge-TTS for high-quality, natural-sounding voiceovers.
- **Stock Footage Integration:** Automatically searches and downloads relevant videos/images from Pexels based on script keywords.
- **Remotion Rendering:** Uses React-based Remotion text-to-video engine for high-quality rendering.
- **Batch Processing:** Support for processing multiple video jobs in a single run.
- **Caching:** Caches downloaded assets and API responses to save time and bandwidth.
- **Local Asset Support:** Use your own images and videos from the `input/input-assets` folder.
- **Director Mode (`[Visual: ...]`)**: Embedded tags for precise control, automatically filtered from on-screen text.

---

## 🏗️ How it Works (Architecture Workflow)
1. **Script Parsing:** Reads `input-scripts.json`, identifies scene breaks, and extracts hidden visual tags.
2. **Media Acquisition:** Queries APIs (Pexels) to download HD video or image assets matching the scene.
3. **Voice Generation:** Converts the text into an MP3 file, accurately calculating scene durations.
4. **Per-Job Workspace Creation:** MCP-triggered runs isolate assets under `public/jobs/<outputId>/audio|videos|visuals`.
5. **Scene Data Save:** The pipeline writes `output/<outputId>/scene-data.json` as the source of truth for rendering.
6. **Remotion Bundling:** React components dynamically map state (timestamps, asset paths, text) into a timeline.
7. **Segmented Rendering:** Renders individual scenes as chunked MP4s to prevent memory overflow.
8. **Final Assembly:** FFmpeg concatenates all segments into the final polished video.

---

## 🐳 Docker Deployment (Zero Dependency)
Run the entire text-to-video system in a container without installing Node.js, Python, or FFmpeg locally.

1. **Configure:** Create your `.env` file (see `.env.example`).
2. **Run:**
    ```bash
    docker-compose up --build
    ```
3. **Result:** The final video appears in your local `output/` directory.

---

## 📋 Manual Installation

### Prerequisites
- **Node.js** (v18 or higher)
- **npm** (comes with Node.js)
- **FFmpeg** (Required for Remotion and media processing - ensure it is in your system PATH)
- **Python** (v3.8 or higher, required for Edge-TTS generation)

### Setup
```bash
git clone https://github.com/itsPremkumar/Automated-Video-Generator.git
cd Automated-Video-Generator
npm install
pip install -r requirements.txt
```

Set up your environment variables by creating a `.env` file in the root directory:
```env
# Get a free key from https://www.pexels.com/api/
PEXELS_API_KEY=your_key_here
```

---

## 📖 Usage & Script Output

### 1. Batch Generation (CLI Mode)
Create an `input/input-scripts.json` file with your video jobs. You can pass multiple objects in the array to queue multiple videos.

#### 📝 Full Configuration Schema (Input Variants)
Every job object supports the following configuration properties, allowing you to heavily customize each unique video without touching code:

| Property | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | String | Yes | Unique slug for the video (used for output folder name). |
| `title` | String | Yes | Main title text displayed in the video. |
| `script` | String | Yes | The narrative content, including `[Visual: ...]` tags. |
| `orientation` | String | No | Output format. Options: `landscape` (16:9) or `portrait` (9:16 Shorts/TikToks). |
| `voice` | String | No | AI Voice ID to override the default `.env` setting. |
| `showText` | Boolean | No | Toggle on-screen text display. Defaults to `true`. |
| `defaultVideo` | String | No | Local filename (in `input/input-assests/`) used if no script visual is found. |

#### 🗣️ Available AI Voices
You have access to several high-quality neural voices natively supported by the TTS engine:
*   **Male Voices:** `en-US-GuyNeural` (Deep, Authoritative), `en-US-ChristopherNeural` (Calm), `en-GB-RyanNeural` (British Accent), `en-IN-PrabhatNeural` (Indian Accent).
*   **Female Voices:** `en-US-JennyNeural` (Warm, Professional), `en-US-AriaNeural` (Friendly), `en-US-SaraNeural` (Cheerful), `en-GB-SoniaNeural` (British Accent).

#### 📝 Example Configurations (Different Varieties)
You can include multiple jobs in the `input-scripts.json` array to batch-generate videos with entirely different formats. Here are common examples:

```json
[
  {
    "id": "youtube-shorts-marketing",
    "title": "10x Your Productivity",
    "orientation": "portrait",
    "voice": "en-US-JennyNeural",
    "script": "[Visual: highly productive office worker] Do you struggle with time management? [Visual: clock ticking fast] Stop wasting your hours. Try our new app today."
  },
  {
    "id": "landscape-youtube-documentary",
    "title": "The Deep Ocean",
    "orientation": "landscape",
    "voice": "en-US-ChristopherNeural",
    "script": "[Visual: dark ocean waves] The ocean covers seventy percent of our planet. [Visual: glowing deep sea jellyfish] Yet it remains one of the most unexplored frontiers."
  },
  {
    "id": "local-assets-demo",
    "title": "My Travel Vlog",
    "orientation": "landscape",
    "voice": "en-US-GuyNeural",
    "script": "[Visual: intro.mp4] Welcome to my vlog! [Visual: beach-photo.jpg] The weather today is absolutely perfect."
  },
  {
    "id": "no-text-branding",
    "title": "Cinematic Visuals",
    "script": "[Visual: abstract technology] No subtitles on this one.",
    "showText": false,
    "defaultVideo": "brand_fallback.mp4"
  }
]
```

Run the generator:
```bash
npm run generate
```
This command will validate scripts, fetch stock footage, generate voiceovers, and render the final video to `output/{id}/out.mp4`.

### 2. Advanced Script Features 🎨 (Director Mode)
You can act as the **Director** by adding specific visual instructions directly in your script using `[Visual: ...]` tags.

*   **How it works:** The system searches for exactly what you type in the brackets and *silently* removes it from the voiceover and text overlay.
*   **Format:** `[Visual: Search Query Here] Spoken text here.`

**Example:**
```text
[Visual: prem.jpg] This is a local image from your assets folder.
[Visual: prem_mass.mp4] This is a local video that will play automatically.
[Visual: futuristic city neon night] This searches for a stock video.
```

> **📏 Script Length Guidelines**
>
> To estimate your video duration based on script length:
> - **1 Minute Video:** ~135-140 words
> - **5 Minute Video:** ~700 words
> - **10 Minute Video:** ~1,400 words
>
> *Note based on average speaking rate of ~136 words per minute.*

### 3. Development & Preview (Remotion Studio)
To preview your video templates and verify the rendering logic directly in your browser:
```bash
npm run remotion:studio
```

### 4. API Server (Optional)
To run the system as a local API server:
```bash
npm run dev
```

Then open:
```text
http://localhost:3001/
```

The local server now includes a simple end-user portal:
- Start a render from the browser form or `POST /generate-video`
- Track progress on `/jobs/:jobId` or `GET /api/jobs/:jobId`
- Watch the finished video on `/videos/:videoId`
- Download the final MP4 from `/download/:videoId`

---

## 🗃️ Project Structure

-   **`src/`**
    -   **`cli.ts`**: Entry point for batch generation.
    -   **`server.ts`**: Express server entry point.
    -   **`mcp-server.ts`**: MCP server entry point for Claude Desktop / Claude Code.
    -   **`mcp-resources.ts`**: MCP resources for input/output/public/config context.
    -   **`mcp-prompts.ts`**: MCP prompt templates.
    -   **`pipeline-workspace.ts`**: Per-job public workspace helpers.
    -   **`video-generator.ts`**: Core logic orchestrator. Manages the pipeline (Validate -> Parse -> Fetch -> Voice -> Save).
    -   **`render.ts`**: Handles the interaction with Remotion to render the final video file.
    -   **`lib/`**
        -   **`script-parser.ts`**: Analyzes text scripts to identify scenes and keywords.
        -   **`visual-fetcher.ts`**: Interacts with Pexels API to find and download media.
        -   **`voice-generator.ts`**: Wraps Edge-TTS to generate audio files.
        -   **`cleaner.ts`**: Utility for cleaning up temporary files.
-   **`remotion/`**
    -   **`index.ts`**: Remotion entry point.
    -   **`MainVideo.tsx`**: The main React component defining the video layout and composition.
-   **`public/`**: Stores downloaded assets. MCP runs isolate files under `public/jobs/<outputId>/`.
-   **`output/`**: Destination for generated video files.
-   **`.mcp-jobs.json`**: Async job status tracking for MCP requests.
-   **`.video-cache.json`**: Cached stock visual selections.

---

## ⚙️ Configuration
-   **Video Resolution:** Defaults to 1080x1920 (Vertical/TikTok style). Configurable in `remotion/index.ts`.
-   **Voice:** Default voice can be changed in `src/lib/voice-generator.ts` (currently uses `en-US-ChristopherNeural`) or configured via `.env` variables.

---

## 🐞 Troubleshooting
-   **"FFmpeg not found":** Ensure FFmpeg is installed and added to your system PATH. Restart your terminal after installing.
-   **Pexels API Errors:** Check your `PEXELS_API_KEY` in `.env`. Ensure you have quota remaining.
-   **Render Failures:** Check the `output/` folder for logs. Ensure you have enough disk space and RAM.

---

## 💬 Frequently Asked Questions (SEO)
**Is this an AI Video Generator?**  
It uses AI (Neural TTS) for voiceovers but relies on deterministic API fetching and programmatic logic for visuals, giving you precise, predictable control without the unpredictability of generative video models.

**Can I use my own offline videos and images?**  
Yes. Place your files in the `input-assets/` folder and reference them using `[Visual: my_file.mp4]` in your script.

**How do I make YouTube Shorts or TikToks?**  
Change the `VIDEO_ORIENTATION` environment variable in your `.env` file to `portrait` to render 9:16 videos.

## 🧠 Claude AI Integration (MCP)

This project ships with a built-in **Model Context Protocol (MCP) Server**, allowing **Claude Desktop**, **Claude Code**, and other MCP-compatible clients to use your video generator as a native tool.

Once configured, you can simply chat with Claude:
> *"Make me a portrait YouTube Short about space exploration using a calm male voice"*

And Claude will autonomously fetch footage, generate voiceovers, render via Remotion, and return the final `.mp4` path.

### Quick Start
```json
// Add to your claude_desktop_config.json
{
  "mcpServers": {
    "automated-video-generator": {
      "command": "npx",
      "args": ["-y", "tsx", "/absolute/path/to/Automated-Video-Generator/src/mcp-server.ts"],
      "cwd": "/path/to/Automated-Video-Generator"
    }
  }
}
```

Use an absolute path for `src/mcp-server.ts`. Claude Desktop may launch MCP servers from outside the repo, and the absolute script path avoids module resolution issues.

📖 Full setup instructions: **[CLAUDE_MCP_SETUP.md](CLAUDE_MCP_SETUP.md)**

### Exposed Tools
| Tool | Description |
| :--- | :--- |
| `generate_video` | Start a background MCP video-generation job. |
| `get_video_status` | Check async render progress and final output path. |
| `read_output_file` | Inspect `scene-data.json` and other output files. |
| `get_workspace_paths` | Show the active `input`, `output`, and `public/jobs/<outputId>` paths. |
| `list_public_files` | Browse generated job assets under `public/`. |

### 🦀 ClawHub AI Skills
The Automated Video Generator project is officially available on ClawHub. You can discover and use our native skills:
- **[Video Generator CLI](https://clawhub.ai/itspremkumar/video-gen-cli)**: High-performance command line tools for mass video production.
- **[Video Script Generator](https://clawhub.ai/itspremkumar/video-gen-script)**: Agentic skill to turn storytelling prompts into video-ready JSON scripts.

---

## 🤝 Community & Support
We welcome contributions! Please refer to our [Contributing Guidelines](CONTRIBUTING.md) to get started.

- 🤖 **Claude Users:** See our [Claude MCP Setup Guide](CLAUDE_MCP_SETUP.md)
- 🦀 **OpenClaw Users:** See our [ClawHub Publishing Guide](CLAWHUB_GUIDE.md)

<p align="center">
  Made with ❤️ by Premkumar.<br>
  Check out our <a href="CODE_OF_CONDUCT.md">Code of Conduct</a> and <a href="SECURITY.md">Security Policy</a>.
</p>

<!-- GitHub SEO Tags/Topics: text-to-video, automated-video, video-generation, remotion, edge-tts, ai-video, faceless-youtube, open-source-video-maker, ffmpeg-wrapper, mcp-server, claude-plugin, model-context-protocol -->
