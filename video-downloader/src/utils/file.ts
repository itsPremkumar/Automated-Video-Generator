import * as path from 'path';
import * as fs from 'fs-extra';

export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
    if (!seconds) return 'Unknown';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export function sanitizeFilename(name: string): string {
    return name
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 200) || 'untitled';
}

export async function getAvailablePath(
    dir: string,
    baseName: string,
    extension: string,
): Promise<string> {
    await fs.ensureDir(dir);
    let targetPath = path.join(dir, `${baseName}.${extension}`);
    let counter = 1;
    while (await fs.pathExists(targetPath)) {
        targetPath = path.join(dir, `${baseName}_${counter}.${extension}`);
        counter++;
    }
    return targetPath;
}

export async function getExistingFileSize(filePath: string): Promise<number> {
    try {
        const stat = await fs.stat(filePath);
        return stat.size;
    } catch {
        return 0;
    }
}
