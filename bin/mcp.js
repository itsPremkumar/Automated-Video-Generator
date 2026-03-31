#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function checkDependency(command, name, installInstructions) {
  try {
    execSync(command, { stdio: 'ignore' });
    return true;
  } catch (e) {
    console.error(`Error: ${name} is not installed.`);
    console.error(installInstructions);
    process.exit(1);
  }
}

// 1. Check FFmpeg
checkDependency(
  'ffmpeg -version',
  'FFmpeg',
  'Please install FFmpeg to use this tool: https://ffmpeg.org/download.html'
);

// 2. Check Python
try {
  execSync('python --version', { stdio: 'ignore' });
} catch (e) {
  try {
    execSync('python3 --version', { stdio: 'ignore' });
  } catch (e2) {
    console.error('Error: Python is not installed.');
    console.error('Please install Python to use this tool: https://www.python.org/downloads/');
    process.exit(1);
  }
}

// 3. Handle .env
const envPath = path.join(projectRoot, '.env');
const envExamplePath = path.join(projectRoot, '.env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.error('\x1b[32m%s\x1b[0m', '✅ Created .env from .env.example');
    console.error('\x1b[33m%s\x1b[0m', '⚠️  ACTION REQUIRED: Please open the .env file and add your PEXELS_API_KEY.');
    console.error('Get a free key at: https://www.pexels.com/api/');
    process.exit(0);
  } else {
    console.error('Error: .env.example not found. Please ensure the project is complete.');
    process.exit(1);
  }
}

// 4. Validate Pexels API Key
const envContent = fs.readFileSync(envPath, 'utf-8');
if (envContent.includes('PEXELS_API_KEY=your_pexels_api_key_here')) {
  console.error('\x1b[31m%s\x1b[0m', 'Error: PEXELS_API_KEY is not set in .env');
  console.error('Please add your Pexels API key to the .env file.');
  process.exit(1);
}

// 5. Spawn MCP Server
console.error('\x1b[36m%s\x1b[0m', '🚀 Starting Automated Video Generator MCP Server...');

const tsxPath = path.join(projectRoot, 'node_modules', '.bin', 'tsx');
const serverPath = path.join(projectRoot, 'src', 'mcp-server.ts');

const mcpServer = spawn(tsxPath, [serverPath], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true
});

mcpServer.on('exit', (code) => {
  process.exit(code || 0);
});
