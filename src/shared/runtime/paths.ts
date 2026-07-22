import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const isElectronPackaged =
    (!!(process.versions as any).electron && !(process.env as any).ELECTRON_IS_DEV && (process as any).resourcesPath) ||
    (process.env.ELECTRON_BACKEND_SERVER === '1' && !!process.env.ELECTRON_RESOURCES_PATH);

const resourcesPath: string = (process as any).resourcesPath || process.env.ELECTRON_RESOURCES_PATH || '';

export const projectRoot = isElectronPackaged
    ? process.env.ELECTRON_APP_ROOT || path.join(resourcesPath, 'app')
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

export const dataRoot = isElectronPackaged ? resolvePackagedDataRoot() : projectRoot;

const runtimePublicRoot = isElectronPackaged ? path.join(dataRoot, 'staging') : path.join(projectRoot, 'workspace', 'staging');

const runtimeManagedRoots = new Set(['.env', '.mcp-jobs.json', '.video-cache.json', 'logs', 'output', 'tmp', 'staging']);

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
    // SECURITY: strip `..`/`.` in ALL runtimes (not just Electron). The previous
    // server-mode branch called resolveBundledProjectPath directly, so a crafted
    // `..` segment (e.g. via API-bound localAsset/publicId) escaped the intended
    // directory. normalizeRelativeSegments throws on `..` (path traversal).
    const safeSegments = normalizeRelativeSegments(segments);

    if (!isElectronPackaged || safeSegments.length === 0) {
        return resolveBundledProjectPath(...safeSegments);
    }

    const [first, ...rest] = safeSegments;
    const safeRest = normalizeRelativeSegments(rest);

    if (runtimeManagedRoots.has(first)) {
        return path.join(dataRoot, first, ...safeRest);
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
    const stagingPath = resolveRuntimePublicPath(...normalized);
    if (fs.existsSync(stagingPath)) {
        return stagingPath;
    }
    return resolveBundledProjectPath('public', ...normalized);
}

export function resolveWorkspacePath(...segments: string[]): string {
    return resolveProjectPath('workspace', ...normalizeRelativeSegments(segments));
}


export function resolveWorkspaceTempPath(...segments: string[]): string {
    return resolveWorkspacePath('tmp', ...normalizeRelativeSegments(segments));
}

/**
 * makeWorkspaceTempDir — `fs.mkdtempSync` that lands under `workspace/tmp/<sub>`
 * instead of the system TEMP directory.
 *
 * Backward-compatible helper: callers pass a `prefix` (the unique prefix they
 * used to pass to `fs.mkdtempSync(path.join(os.tmpdir(), prefix))`). The returned
 * path is created on disk and guaranteed to live under `workspace/tmp`.
 *
 * NOTE: `fs.mkdtempSync(prefix)` interprets `prefix` as the *full* template path
 * and creates the directory there (appending 6 random chars). So we pass
 * `path.join(base, prefix)` — NOT a separate root arg — to anchor it under the
 * workspace temp dir.
 */
export function makeWorkspaceTempDir(prefix: string, sub = 'tests'): string {
    const base = resolveWorkspaceTempPath(sub);
    fs.mkdirSync(base, { recursive: true });
    return fs.mkdtempSync(path.join(base, prefix));
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
