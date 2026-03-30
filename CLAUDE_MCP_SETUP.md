# 🤖 Claude MCP Integration Guide

This guide explains how to connect your **Automated Video Generator** directly to the **Claude Desktop App** so Claude can autonomously generate videos for you through natural conversation.

## 🧠 What is MCP?

**Model Context Protocol (MCP)** is an open standard by Anthropic that connects AI assistants like Claude to external tools and local applications. Once configured, you can simply ask Claude:

> *"Create a portrait marketing video about artificial intelligence using a British female voice with no subtitles"*

And Claude will **autonomously** execute your video pipeline, fetch stock footage, generate voiceovers, render via Remotion, and return the path to your final `.mp4` file! 🎬

---

## ⚡ Quick Setup

### Step 1: Install Dependencies

Ensure all project dependencies are installed:
```bash
npm install
pip install -r requirements.txt
```

### Step 2: Set Up Your API Key

Create a `.env` file in the project root:
```env
PEXELS_API_KEY=your_pexels_api_key_here
```

### Step 3: Configure Claude Desktop

Locate your Claude Desktop configuration file:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

If the file doesn't exist, create it. Add the following configuration:

#### Windows Configuration:
```json
{
  "mcpServers": {
    "automated-video-generator": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server.ts"],
      "cwd": "C:\\path\\to\\Automated-Video-Generator",
      "env": {
        "PEXELS_API_KEY": "your_pexels_api_key_here"
      }
    }
  }
}
```

#### macOS / Linux Configuration:
```json
{
  "mcpServers": {
    "automated-video-generator": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server.ts"],
      "cwd": "/path/to/Automated-Video-Generator",
      "env": {
        "PEXELS_API_KEY": "your_pexels_api_key_here"
      }
    }
  }
}
```

> **Important:** Replace the `cwd` path with the actual absolute path to your cloned repository.

### Step 4: Restart Claude Desktop

Close and reopen the Claude Desktop application. You should now see a 🔨 hammer icon in the chat input, indicating MCP tools are available.

---

## 🛠️ Available Tools

Once connected, Claude has access to the following tools:

### `generate_video`
The primary tool. Generates a complete video from a text script.

**Parameters:**
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `title` | String | *(required)* | Video title, used for the output filename. |
| `script` | String | *(required)* | Narrative content with `[Visual: ...]` tags. |
| `orientation` | String | `portrait` | `portrait` (9:16) or `landscape` (16:9). |
| `voice` | String | `en-US-JennyNeural` | Edge-TTS voice ID. |
| `showText` | Boolean | `true` | Show on-screen subtitles. |
| `defaultVideo` | String | `default.mp4` | Fallback video file from `input/input-assests/`. |

### `list_voices`
Lists all available AI voice options with their styles and regions.

### `list_local_assets`
Lists all media files in your `input/input-assests/` directory that can be referenced in scripts.

---

## 💬 Example Conversations with Claude

Once configured, you can have natural conversations like:

**Example 1: Quick Short**
> You: "Make me a YouTube Short about machine learning breakthroughs"
> Claude: *(uses generate_video tool, returns the .mp4 path)*

**Example 2: Branded Content**
> You: "Generate a landscape video titled 'Ocean Documentary' using the British male voice with no subtitles"
> Claude: *(calls generate_video with orientation=landscape, voice=en-GB-RyanNeural, showText=false)*

**Example 3: Check Assets First**
> You: "What local videos do I have available?"
> Claude: *(calls list_local_assets, shows your files)*
> You: "Great, use intro.mp4 for the first scene of a new marketing video"

---

## 🔧 Claude Code Integration

If you use **Claude Code** (CLI), you can also add the MCP server:

```bash
claude mcp add automated-video-generator -- npx tsx src/mcp-server.ts
```

---

## 🐞 Troubleshooting

| Issue | Solution |
| :--- | :--- |
| No hammer icon in Claude | Restart Claude Desktop. Check the config JSON for syntax errors. |
| `PEXELS_API_KEY` missing | Add it to the `env` block in your config or to a `.env` file. |
| `tsx` not found | Run `npm install` in the project directory first. |
| Render crashes | Ensure FFmpeg is installed and in your system PATH. |
| Python errors | Run `pip install -r requirements.txt`. |

---

## 📋 For Plugin Submission to Anthropic

If you want to submit this as an official plugin to the Claude marketplace, visit:

- **Claude.ai:** [claude.ai/settings/plugins/submit](https://claude.ai/settings/plugins/submit)
- **Anthropic Console:** [console.anthropic.com/plugins/submit](https://console.anthropic.com/plugins/submit)

You will need:
1. Your GitHub repository URL: `https://github.com/itsPremkumar/Automated-Video-Generator`
2. The `.claude-plugin/plugin.json` manifest (already created in this project).
3. A description of the tools exposed by your MCP server.
