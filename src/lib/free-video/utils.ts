import * as path from 'path';
import * as fs from 'fs';

export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function sanitizeFilename(name: string): string {
    return (
        name
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 200) || 'untitled'
    );
}

export async function getAvailablePath(dir: string, baseName: string, extension: string): Promise<string> {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    let targetPath = path.join(dir, `${baseName}.${extension}`);
    let counter = 1;
    while (fs.existsSync(targetPath)) {
        targetPath = path.join(dir, `${baseName}_${counter}.${extension}`);
        counter++;
    }
    return targetPath;
}

export async function getExistingFileSize(filePath: string): Promise<number> {
    try {
        const stat = fs.statSync(filePath);
        return stat.size;
    } catch {
        return 0;
    }
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: { retries: number; baseDelayMs: number; label?: string },
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= options.retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < options.retries) {
                const delay = options.baseDelayMs * Math.pow(2, attempt);
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}
