import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync, execSync } from 'child_process';

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function writeTextFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function generateTempFilePath(extension: string, prefix = 'gen'): string {
  const dir = path.join(os.tmpdir(), 'free-video-gen-lab');
  ensureDir(dir);
  const timestamp = Date.now();
  return path.join(dir, `${prefix}_${timestamp}.${extension}`);
}

export function isCommandAvailable(command: string): boolean {
  try {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'where' : 'which';
    const result = spawnSync(cmd, [command], {
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
    });
    if (result.status !== 0) return false;
    // On Windows, `where` can return "INFO: Could not find files..." even with exit code 0
    if (isWindows) {
      const stdout = (result.stdout || '').toLowerCase();
      if (stdout.includes('could not find') || stdout.includes('not found')) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function isPythonModuleAvailable(moduleName: string): boolean {
  try {
    const result = spawnSync('python', ['-c', `import ${moduleName}; print('ok')`], {
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function checkPython3Available(): boolean {
  for (const cmd of ['python3', 'python']) {
    try {
      const result = spawnSync(cmd, ['--version'], {
        stdio: 'pipe',
        encoding: 'utf-8',
        shell: false,
      });
      if (result.status === 0) return true;
    } catch { /* continue */ }
  }
  return false;
}

export function getPythonCommand(): string {
  for (const cmd of ['python3', 'python']) {
    try {
      const result = spawnSync(cmd, ['--version'], {
        stdio: 'pipe',
        encoding: 'utf-8',
        shell: false,
      });
      if (result.status === 0) return cmd;
    } catch { /* continue */ }
  }
  return 'python';
}

export function isDockerAvailable(): boolean {
  try {
    const result = spawnSync('docker', ['--version'], {
      stdio: 'pipe',
      shell: false,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function isNvidiaGpuAvailable(): boolean {
  try {
    if (process.platform === 'win32') {
      const result = spawnSync('nvidia-smi', [], { stdio: 'pipe', shell: false });
      return result.status === 0;
    }
    const result = spawnSync('nvidia-smi', [], { stdio: 'pipe', shell: false });
    return result.status === 0;
  } catch {
    return false;
  }
}

export function getGpuMemoryGB(): number {
  try {
    const result = spawnSync('nvidia-smi', [
      '--query-gpu=memory.total',
      '--format=csv,noheader,nounits',
    ], { stdio: 'pipe', encoding: 'utf-8', shell: false });
    if (result.status === 0 && result.stdout) {
      const mb = parseInt(result.stdout.trim().split('\n')[0], 10);
      return Math.round(mb / 1024);
    }
  } catch { /* ignore */ }
  return 0;
}

export async function runPythonScript(scriptPath: string, args: string[] = []): Promise<string> {
  const python = getPythonCommand();
  return new Promise((resolve, reject) => {
    const result = spawnSync(python, [scriptPath, ...args], {
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
      timeout: 120_000,
    });
    if (result.status === 0) {
      resolve(result.stdout || '');
    } else {
      reject(new Error(result.stderr || `Exit code ${result.status}`));
    }
  });
}
