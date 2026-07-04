# CLI Reference

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the local web portal on port 3001 |
| `npm run generate` | Generate videos from `input/input-scripts.json` |
| `npm run resume` | Resume an interrupted generation run |
| `npm run segment` | Rebuild from existing scene data |
| `npm run remotion:studio` | Open Remotion studio for template preview |
| `npm run remotion:render` | Render using the Remotion pipeline |
| `npm run mcp` | Start the MCP server for AI agent integration |
| `npm run typecheck` | Validate TypeScript types |

## CLI Options

When running `npm run generate`:

| Flag | Description |
|------|-------------|
| `--landscape` | Force landscape (16:9) output |
| `--resume` | Resume from existing scene data |
| `--segment` | Run in segment-only mode |
| `--music <file>` | Specify background music file |

## Configuration

See [configuration.md](./configuration.md) for environment variable reference.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error |
