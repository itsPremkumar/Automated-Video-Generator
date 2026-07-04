import * as fs from 'fs';
import * as path from 'path';
import { BadRequestError } from './errors';
import { resolveProjectPath } from '../shared/runtime/paths';

/**
 * The canonical asset directory name.
 */
export const INPUT_ASSETS_DIR = 'input-assets';

/**
 * Root directory for user-uploaded assets (images/videos).
 */
export const INPUT_ASSET_ROOT: string = resolveProjectPath('input', INPUT_ASSETS_DIR);

/**
 * Resolve a relative path under the input-assets directory.
 * Use this instead of hardcoding resolveProjectPath('input', 'input-assets', ...).
 */
export function inputAssetPath(...segments: string[]): string {
    return resolveProjectPath('input', INPUT_ASSETS_DIR, ...segments);
}

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
