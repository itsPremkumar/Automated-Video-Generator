import * as fs from 'fs';
import { resolveProjectPath } from './runtime';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

const ENV_FILE = resolveProjectPath('.env');

export async function readEnvConfig(showSecrets?: boolean) {
  if (!fs.existsSync(ENV_FILE)) {
    return {};
  }
  const content = fs.readFileSync(ENV_FILE, 'utf-8');
  const config = dotenv.parse(content);
  
  if (!showSecrets) {
    const masked: { [key: string]: string } = {};
    for (const key of Object.keys(config)) {
      const val = config[key];
      if (key.match(/KEY|SECRET|PASSWORD|TOKEN|AUTH/i)) {
        masked[key] = val.substring(0, 4) + '****' + val.substring(Math.max(0, val.length - 4));
      } else {
        masked[key] = val;
      }
    }
    return masked;
  }
  return config;
}

export async function updateEnvConfig(key: string, value: string) {
  const content = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8') : '';
  const lines = content.split('\n');
  let found = false;
  const updatedLines = lines.map((line: string) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  
  if (!found) {
    updatedLines.push(`${key}=${value}`);
  }
  
  fs.writeFileSync(ENV_FILE, updatedLines.join('\n'));
  return true;
}

export async function getSystemInfo() {
  const info: { [key: string]: string } = {};
  
  try { info.node = process.version; } catch (e: any) {}
  try { info.npm = execSync('npm -v').toString().trim(); } catch (e: any) {}
  try { info.ffmpeg = execSync('ffmpeg -version').toString().split('\n')[0].trim(); } catch (e: any) {}
  try { info.platform = process.platform; } catch (e: any) {}
  try { info.arch = process.arch; } catch (e: any) {}
  
  return info;
}

export async function healthCheck() {
  const checks: { [key: string]: boolean } = {
    envFile: fs.existsSync(ENV_FILE),
    inputDir: fs.existsSync(resolveProjectPath('input')),
    outputDir: fs.existsSync(resolveProjectPath('output')),
    publicDir: fs.existsSync(resolveProjectPath('public')),
  };
  
  try {
    execSync('ffmpeg -version');
    checks.ffmpeg = true;
  } catch (e: any) {
    checks.ffmpeg = false;
  }
  
  return checks;
}
