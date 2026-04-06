import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { resolveProjectPath, resolveResourcePath, projectRoot } from '../runtime';
import { getVoiceEngineStatus } from '../lib/voice-generator';

export interface HealthCheckResult {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    checks: DependencyCheck[];
    environment: Record<string, string>;
}

export interface DependencyCheck {
    name: string;
    status: 'ok' | 'missing' | 'broken';
    detail: string;
    paths_checked?: string[];
}

function runQuiet(command: string): string | null {
    try {
        return execSync(command, {
            encoding: 'utf8',
            timeout: 10000,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        }).trim();
    } catch {
        return null;
    }
}

function checkPortablePython(): DependencyCheck {
    const resourcesPath = (process as any).resourcesPath
        || process.env.ELECTRON_RESOURCES_PATH
        || '';

    const candidatePaths = [
        resolveProjectPath('portable-python', 'python.exe'),
        resolveResourcePath('app-bundle', 'portable-python', 'python.exe'),
        resolveResourcePath('portable-python', 'python.exe'),
    ];

    // Deduplicate
    const uniquePaths = [...new Set(candidatePaths.filter(Boolean))];

    for (const pythonPath of uniquePaths) {
        if (fs.existsSync(pythonPath)) {
            const version = runQuiet(`"${pythonPath}" --version`);
            if (version) {
                return {
                    name: 'Python (bundled)',
                    status: 'ok',
                    detail: `${version} at ${pythonPath}`,
                    paths_checked: uniquePaths,
                };
            }
            return {
                name: 'Python (bundled)',
                status: 'broken',
                detail: `Found at ${pythonPath} but cannot execute`,
                paths_checked: uniquePaths,
            };
        }
    }

    // Check system Python
    for (const cmd of ['python', 'py', 'python3']) {
        const version = runQuiet(`${cmd} --version`);
        if (version?.toLowerCase().includes('python')) {
            return {
                name: 'Python (system)',
                status: 'ok',
                detail: `${version} via "${cmd}"`,
                paths_checked: uniquePaths,
            };
        }
    }

    return {
        name: 'Python',
        status: 'missing',
        detail: 'No Python installation found (bundled or system)',
        paths_checked: uniquePaths,
    };
}

function checkEdgeTts(): DependencyCheck {
    const voiceEngine = getVoiceEngineStatus();
    if (voiceEngine.generationReady) {
        return {
            name: 'Voice Engine',
            status: 'ok',
            detail: voiceEngine.detail,
        };
    }

    const resourcesPath = (process as any).resourcesPath
        || process.env.ELECTRON_RESOURCES_PATH
        || '';

    const edgeTtsPaths = [
        resolveProjectPath('portable-python', 'Scripts', 'edge-tts.exe'),
        resolveResourcePath('app-bundle', 'portable-python', 'Scripts', 'edge-tts.exe'),
    ];

    const uniquePaths = [...new Set(edgeTtsPaths.filter(Boolean))];

    for (const edgePath of uniquePaths) {
        if (fs.existsSync(edgePath)) {
            const check = runQuiet(`"${edgePath}" --help`);
            if (check) {
                return {
                    name: 'Voice Engine',
                    status: 'ok',
                    detail: `Ready at ${edgePath}`,
                    paths_checked: uniquePaths,
                };
            }
        }
    }

    // Check via system
    const sysCheck = runQuiet('edge-tts --help');
    if (sysCheck) {
        return {
            name: 'Voice Engine',
            status: 'ok',
            detail: 'Available on system PATH',
            paths_checked: uniquePaths,
        };
    }

    return {
        name: 'Voice Engine',
        status: 'missing',
        detail: 'No working voice engine found',
        paths_checked: uniquePaths,
    };
}

function checkFfmpeg(): DependencyCheck {
    // Check bundled ffmpeg-static
    const ffmpegPaths = [
        resolveProjectPath('node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
        resolveProjectPath('node_modules', 'ffmpeg-static', 'ffmpeg'),
    ];

    for (const ffPath of ffmpegPaths) {
        if (fs.existsSync(ffPath)) {
            return {
                name: 'FFmpeg',
                status: 'ok',
                detail: `Bundled at ${ffPath}`,
            };
        }
    }

    // Check system FFmpeg
    const sysCheck = runQuiet('ffmpeg -version');
    if (sysCheck) {
        return {
            name: 'FFmpeg',
            status: 'ok',
            detail: `System: ${sysCheck.split('\n')[0]}`,
        };
    }

    return {
        name: 'FFmpeg',
        status: 'missing',
        detail: 'FFmpeg not found (bundled or system)',
    };
}

function checkNodeModules(): DependencyCheck {
    const nmPath = resolveProjectPath('node_modules');
    if (fs.existsSync(nmPath)) {
        return {
            name: 'Node Modules',
            status: 'ok',
            detail: `Installed at ${nmPath}`,
        };
    }
    return {
        name: 'Node Modules',
        status: 'missing',
        detail: 'node_modules not found, run npm install',
    };
}

export function runHealthCheck(): HealthCheckResult {
    const checks = [
        checkPortablePython(),
        checkEdgeTts(),
        checkFfmpeg(),
        checkNodeModules(),
    ];

    const hasMissing = checks.some(c => c.status === 'missing');
    const hasBroken = checks.some(c => c.status === 'broken');
    const overall = (hasMissing || hasBroken) ? (hasMissing ? 'unhealthy' : 'degraded') : 'healthy';

    return {
        overall,
        checks,
        environment: {
            projectRoot,
            resourcesPath: (process as any).resourcesPath || process.env.ELECTRON_RESOURCES_PATH || 'not set',
            electronBackendServer: process.env.ELECTRON_BACKEND_SERVER || 'not set',
            electronAppRoot: process.env.ELECTRON_APP_ROOT || 'not set',
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            cwd: process.cwd(),
        },
    };
}
