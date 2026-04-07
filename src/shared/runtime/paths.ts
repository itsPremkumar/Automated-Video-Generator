import * as os from 'os';
import * as path from 'path';

const isElectronPackaged = (
    (!!(process.versions as any).electron && !(process.env as any).ELECTRON_IS_DEV && (process as any).resourcesPath)
    || (process.env.ELECTRON_BACKEND_SERVER === '1' && !!process.env.ELECTRON_RESOURCES_PATH)
);

const resourcesPath: string = (process as any).resourcesPath
    || process.env.ELECTRON_RESOURCES_PATH
    || '';

export const projectRoot = isElectronPackaged
    ? (process.env.ELECTRON_APP_ROOT || path.join(resourcesPath, 'app'))
    : path.resolve(__dirname, '..', '..', '..');

function resolvePackagedDataRoot(): string {
    const explicit = process.env.AUTOMATED_VIDEO_GENERATOR_DATA_ROOT?.trim();
    if (explicit) {
        return path.resolve(explicit);
    }

    const localAppData = process.env.LOCALAPPDATA?.trim();
    if (localAppData) {
        return path.join(localAppData, 'Automated Video Generator');
    }

    return path.join(os.homedir(), 'AppData', 'Local', 'Automated Video Generator');
}

export const dataRoot = isElectronPackaged
    ? resolvePackagedDataRoot()
    : projectRoot;

const runtimePublicRoot = isElectronPackaged
    ? path.join(dataRoot, 'public')
    : path.join(projectRoot, 'public');

const runtimeManagedRoots = new Set([
    '.env',
    '.mcp-jobs.json',
    '.video-cache.json',
    'logs',
    'output',
    'tmp',
]);

function normalizeRelativeSegments(segments: string[]): string[] {
    const normalized: string[] = [];

    for (const rawSegment of segments) {
        for (const segment of rawSegment.split(/[\\/]+/)) {
            if (!segment || segment === '.') {
                continue;
            }

            if (segment === '..') {
                throw new Error(`Path traversal is not allowed: ${segments.join(path.sep)}`);
            }

            normalized.push(segment);
        }
    }

    return normalized;
}

function resolveBundledProjectPath(...segments: string[]): string {
    return path.join(projectRoot, ...segments);
}

export function resolveProjectPath(...segments: string[]): string {
    if (!isElectronPackaged || segments.length === 0) {
        return resolveBundledProjectPath(...segments);
    }

    const [first, ...rest] = segments;
    const safeRest = normalizeRelativeSegments(rest);

    if (runtimeManagedRoots.has(first)) {
        return path.join(dataRoot, first, ...safeRest);
    }

    if (first === 'public' && safeRest[0] === 'jobs') {
        return path.join(runtimePublicRoot, ...safeRest);
    }

    return resolveBundledProjectPath(first, ...rest);
}

export function resolveRuntimePublicPath(...segments: string[]): string {
    if (segments.length === 0) {
        return runtimePublicRoot;
    }

    return path.join(runtimePublicRoot, ...normalizeRelativeSegments(segments));
}

export function resolvePublicFilePath(relativePath: string): string {
    const normalized = normalizeRelativeSegments([relativePath]);
    if (normalized[0] === 'jobs') {
        return resolveRuntimePublicPath(...normalized);
    }

    return resolveBundledProjectPath('public', ...normalized);
}

export function resolveResourcePath(...segments: string[]): string {
    if (resourcesPath) {
        return path.join(resourcesPath, ...segments);
    }

    return path.join(projectRoot, ...segments);
}

export function isElectron(): boolean {
    return !!(process.versions as any).electron || process.env.ELECTRON_BACKEND_SERVER === '1';
}

export function inMcpRuntime(): boolean {
    return process.env.AUTOMATED_VIDEO_GENERATOR_MCP === '1';
}

export function ensureProjectRootCwd(): void {
    if (process.cwd() !== projectRoot) {
        process.chdir(projectRoot);
    }
}
