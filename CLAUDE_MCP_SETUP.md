# 🤖 Claude MCP Integration Guide (v1.1.0)

This guide explains how to connect your **Automated Video Generator** directly to the **Claude Desktop App** and **Claude Code CLI**, enabling direct filesystem access, environment management, and whitelisted command execution.

## 🧠 New Advanced Architecture

The latest version of the MCP server expands from 5 basic tools to **16 tools**, **7 resources**, and **4 prompts**, providing a robust, autonomous interface for video creation.

---

## ⚡ Quick Setup

### Step 1: Install Dependencies

Ensure all project dependencies are installed:
```bash
npm install
```

### Step 2: Configure Claude Desktop

Locate your Claude Desktop configuration file:
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Add the following (update the paths to match your project location):

```json
{
  "mcpServers": {
    "automated-video-generator": {
      "command": "npx",
      "args": ["-y", "tsx", "c:\\one\\Automated-Video-Generator\\src\\mcp-server.ts"],
      "cwd": "c:\\one\\Automated-Video-Generator",
      "env": {
        "PEXELS_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### Step 3: Configure Claude Code CLI

Run the following command in your terminal to add the MCP server to Claude Code:

```bash
claude mcp add automated-video-generator -- npx -y tsx c:\one\Automated-Video-Generator\src\mcp-server.ts
```

---

## 🛠️ Available Capabilities

### 📄 Resources (Direct Read-Only Context)
Resources provide Claude with instant context without running a tool.
- `input://scripts` — Current script list.
- `output://videos` — List of all completed videos.
- `config://env` — Current configuration (masked).
- `input://format` — Documentation on script formatting.

### 🔧 Tools (Active Operations)
- **Filesystem Tools:** `write_input_script`, `read_input_script`, `delete_input_script`, `list_output_videos`, `read_output_file`, `delete_output`.
- **Media Tools:** `upload_asset`, `delete_asset`, `list_local_assets`.
- **Pipeline Tools:** `generate_video`, `get_video_status`, `run_pipeline_command` (generate, render, etc.).
- **System Tools:** `read_env_config`, `update_env_config`, `get_system_info`, `health_check`.

### 💬 Prompts (Workflow Templates)
Use these by typing `/automated-video-generator.prompt-name` in the chat.
- `create-marketing-video` — Simplified marketing video workflow.
- `create-youtube-short` — Portrait viral video workflow.
- `batch-generate` — Process multiple topics at once.
- `debug-pipeline` — Diagnose and fix issues.

---

## 🔐 Permission Settings

Claude will respect your permission choices. It is recommended to use:
- **Allow:** Read tools and resources.
- **Ask:** Write tools (`write_input_script`, `upload_asset`, `update_env_config`).
- **Ask/Deny:** Destructive tools (`delete_output`, `delete_asset`).
- **Ask:** Execution tools (`generate_video`, `run_pipeline_command`).

---

## 🐞 Troubleshooting

If tools don't appear:
1. Ensure `PEXELS_API_KEY` is set in your `.env` or the config `env` block.
2. Restart Claude Desktop or run `/reload` in Claude Code.
3. Check the CLI console for error logs from the MCP server.
4. Run the `health_check` tool to verify all dependencies are present.
