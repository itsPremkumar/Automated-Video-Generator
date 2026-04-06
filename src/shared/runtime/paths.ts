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

export function resolveProjectPath(...segments: string[]): string {
    return path.join(projectRoot, ...segments);
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
