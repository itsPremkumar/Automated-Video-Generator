const { spawn } = require('child_process');

const electronBinary = require('electron');
const env = {
  ...process.env,
  AUTOMATED_VIDEO_GENERATOR_DEBUG: process.env.AUTOMATED_VIDEO_GENERATOR_DEBUG || '1',
  AUTOMATED_VIDEO_GENERATOR_OPEN_DEVTOOLS: process.env.AUTOMATED_VIDEO_GENERATOR_OPEN_DEVTOOLS || '1',
  AUTOMATED_VIDEO_GENERATOR_REMOTE_DEBUG_PORT: process.env.AUTOMATED_VIDEO_GENERATOR_REMOTE_DEBUG_PORT || '9222',
};

const args = ['.', '--avgen-debug', '--avgen-devtools'];

const child = spawn(electronBinary, args, {
  env,
  shell: false,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
