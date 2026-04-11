import * as fs from 'fs';
import * as path from 'path';
import { BadRequestError } from './errors';
import { resolveProjectPath } from '../shared/runtime/paths';

/**
 * Root directory for user-uploaded assets (images/videos)
 */
export const INPUT_ASSET_ROOT = resolveProjectPath('input', 'input-assests');

/**
 * Root directory for user-uploaded music/audio
 */
export const INPUT_MUSIC_ROOT = resolveProjectPath('input', 'music');

/**
 * Resolve a filename to its absolute path within the asset root
 */
export function resolveAssetPath(filename: string): string {
    return path.join(INPUT_ASSET_ROOT, path.basename(filename));
}

/**
 * Ensure a filename has one of the allowed extensions
 */
export function ensureAllowedExtension(filename: string, allowed: string[]): void {
    const ext = path.extname(filename).toLowerCase();
    if (!allowed.includes(ext)) {
        throw new BadRequestError(`Invalid file extension: ${ext}. Allowed: ${allowed.join(', ')}`);
    }
}

/**
 * Build a unique file path within a directory to avoid collisions
 */
export function buildUniqueFilePath(directory: string, filename: string): string {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let targetPath = path.join(directory, filename);
    let counter = 1;

    while (fs.existsSync(targetPath)) {
        targetPath = path.join(directory, `${base}_${counter}${ext}`);
        counter++;
    }

    return targetPath;
}
