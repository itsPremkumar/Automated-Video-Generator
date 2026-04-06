#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env');
const envExamplePath = path.join(projectRoot, '.env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.error('\x1b[32m%s\x1b[0m', 'Created .env from .env.example');
    console.error('\x1b[33m%s\x1b[0m', 'Add your PEXELS_API_KEY to the .env file before starting MCP.');
    process.exit(0);
  }

  console.error('Error: .env.example not found. Please ensure the project is complete.');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
if (envContent.includes('PEXELS_API_KEY=your_pexels_api_key_here')) {
  console.error('\x1b[31m%s\x1b[0m', 'Error: PEXELS_API_KEY is not set in .env');
  console.error('Please add your Pexels API key to the .env file.');
  process.exit(1);
}

console.error('\x1b[36m%s\x1b[0m', 'Starting Automated Video Generator MCP Server...');

const tsxPath = path.join(projectRoot, 'node_modules', '.bin', 'tsx');
const serverPath = path.join(projectRoot, 'src', 'mcp-server.ts');

const mcpServer = spawn(tsxPath, [serverPath], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
});

mcpServer.on('exit', (code) => {
  process.exit(code || 0);
});
