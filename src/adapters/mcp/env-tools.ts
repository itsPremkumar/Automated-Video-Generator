import * as fs from 'fs';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import { resolveProjectPath } from '../../shared/runtime/paths';

const ENV_FILE = resolveProjectPath('.env');

export async function readEnvConfig(showSecrets?: boolean) {
    if (!fs.existsSync(ENV_FILE)) return {};
    const config = dotenv.parse(fs.readFileSync(ENV_FILE, 'utf-8'));
    if (showSecrets) return config;
    const masked: Record<string, string> = {};
    for (const key of Object.keys(config)) {
        const value = config[key];
        masked[key] = key.match(/KEY|SECRET|PASSWORD|TOKEN|AUTH/i) ? value.substring(0, 4) + '****' + value.substring(Math.max(0, value.length - 4)) : value;
    }
    return masked;
}

export async function updateEnvConfig(key: string, value: string) {
    const content = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf-8') : '';
    const lines = content.split('\n');
    let found = false;
    const updatedLines = lines.map((line) => {
        if (line.startsWith(`${key}=`)) {
            found = true;
            return `${key}=${value}`;
        }
        return line;
    });
    if (!found) updatedLines.push(`${key}=${value}`);
    fs.writeFileSync(ENV_FILE, updatedLines.join('\n'));
    return true;
}

export async function getSystemInfo() {
    const info: Record<string, string> = {};
    try { info.node = process.version; } catch {}
    try { info.npm = execSync('npm -v').toString().trim(); } catch {}
    try { info.ffmpeg = execSync('ffmpeg -version').toString().split('\n')[0].trim(); } catch {}
    try { info.platform = process.platform; } catch {}
    try { info.arch = process.arch; } catch {}
    return info;
}

export async function healthCheck() {
    const checks: Record<string, boolean> = {
        envFile: fs.existsSync(ENV_FILE),
        inputDir: fs.existsSync(resolveProjectPath('input')),
        outputDir: fs.existsSync(resolveProjectPath('output')),
        publicDir: fs.existsSync(resolveProjectPath('public')),
    };
    try {
        execSync('ffmpeg -version');
        checks.ffmpeg = true;
    } catch {
        checks.ffmpeg = false;
    }
    return checks;
}
