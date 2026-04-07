// This file must be imported FIRST in mcp-server.ts to ensure the MCP
// environment flag is set before any other module-level code executes.
// ES module imports are hoisted, so setting env vars inline in the main
// file runs AFTER all import side-effects. This separate module ensures
// the flag is available during the module-loading phase.
process.env.AUTOMATED_VIDEO_GENERATOR_MCP = '1';
