# MCP Agent Example

This example shows how to use the Automated Video Generator MCP server with AI agents.

## Prerequisites

- Node.js 18+
- The project installed locally or globally

## Setup

### Claude Code

```bash
claude mcp add automated-video-generator -- npx automated-video-generator
```

Then in your Claude conversation:

```
Generate a video about renewable energy. Make it portrait orientation
for YouTube Shorts. Use English voice.
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "automated-video-generator": {
      "command": "npx",
      "args": ["automated-video-generator"]
    }
  }
}
```

### Custom MCP Client

Start the MCP server:

```bash
npm run mcp
```

Connect using any MCP-compatible client. Available tools:

- `generate_video` — Create a video from a script
- `search_free_video` — Search Wikimedia Commons and Internet Archive
- `list_assets` — List files in input directory
- `upload_asset` — Upload a file to input assets

## Example Prompts

- "Create a 30-second video explaining quantum computing"
- "Generate a Tamil language video about healthy eating habits"
- "Search for free videos of nature and create a compilation"
