# MCP Agent Example

Use the MCP (Model Context Protocol) server to generate videos through AI agents like Claude Desktop and Claude Code.

## Purpose

Demonstrates the MCP server integration, allowing AI tools to create, configure, and manage video generation autonomously through natural language.

## Expected Output

Videos created entirely through conversational AI interaction — no manual script editing or command-line configuration needed.

## Usage

### Start the MCP Server

```bash
# From the project root
npm run mcp
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

### Claude Code

```bash
claude mcp add automated-video-generator -- npx automated-video-generator
```

### Available MCP Tools

Once connected, AI agents can:
- Create and manage video jobs
- Search and preview stock media
- Monitor rendering progress
- Retrieve completed video files
- List available voices and languages

See [Claude MCP Setup Guide](../../docs/CLAUDE_MCP_SETUP.md) for full documentation.
