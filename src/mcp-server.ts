#!/usr/bin/env node

import './mcp-env-init';  // MUST be first — sets MCP flag before any other module loads
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as dotenv from 'dotenv';
import { registerAdminTools } from './adapters/mcp/register-admin-tools';
import { registerInputTools } from './adapters/mcp/register-input-tools';
import { registerJobTools } from './adapters/mcp/register-job-tools';
import { registerOutputTools } from './adapters/mcp/register-output-tools';
import { registerPrompts } from './mcp-prompts';
import { registerResources } from './mcp-resources';
import { ensureProjectRootCwd, projectRoot, resolveProjectPath } from './shared/runtime/paths';
ensureProjectRootCwd();
dotenv.config({ path: resolveProjectPath('.env') });

const server = new McpServer({
    name: 'automated-video-generator',
    version: '1.2.0',
});

registerResources(server);
registerPrompts(server);
registerInputTools(server);
registerOutputTools(server);
registerJobTools(server);
registerAdminTools(server);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write(`[MCP] Automated Video Generator server (v1.2.0) is running from ${projectRoot}.\n`);
}

main().catch((error) => {
    process.stderr.write(`[MCP] Fatal error: ${error.message}\n`);
    process.exit(1);
});
