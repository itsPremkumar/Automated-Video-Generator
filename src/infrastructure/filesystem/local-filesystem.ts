import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import {
    buildUniqueFilePath,
    ensureAllowedExtension,
    INPUT_ASSET_ROOT,
    INPUT_MUSIC_ROOT,
    resolveAssetPath,
} from '../../lib/path-safety';
import { resolveProjectPath } from '../../shared/runtime/paths';

const execAsync = promisify(exec);
const MAX_DIRECTORY_ITEMS = 500;
const STREAMABLE_EXTENSIONS = ['.m4a', '.mov', '.mp3', '.mp4', '.ogg', '.wav', '.webm'];
const VIEWABLE_EXTENSIONS = ['.gif', '.jpeg', '.jpg', '.m4a', '.mov', '.mp3', '.mp4', '.ogg', '.png', '.wav', '.webm', '.webp'];

function resolveContentType(extension: string): string | null {
    const contentTypes: Record<string, string> = {
        '.gif': 'image/gif',
        '.jpeg': 'image/jpeg',
        '.jpg': 'image/jpeg',
        '.m4a': 'audio/mp4',
        '.mov': 'video/quicktime',
        '.mp3': 'audio/mpeg',
        '.mp4': 'video/mp4',
        '.ogg': 'audio/ogg',
        '.png': 'image/png',
        '.wav': 'audio/wav',
        '.webm': 'video/webm',
        '.webp': 'image/webp',
    };

    return contentTypes[extension] || null;
}

export type PickedFileType = 'asset' | 'media' | 'music' | 'personalAudio';

export type ViewFileResult =
    | {
        type: 'range';
        filePath: string;
        contentType: string;
        stat: fs.Stats;
        start: number;
        end: number;
    }
    | {
        type: 'file';
        filePath: string;
        contentType: string | null;
    };

export class LocalFilesystem {
    listFiles(rawPath?: string) {
        const queryPath = rawPath ? path.resolve(rawPath) : process.cwd();
        if (!fs.existsSync(queryPath)) {
            throw new NotFoundError('Path not found.');
        }

        const stats = fs.statSync(queryPath);
        if (!stats.isDirectory()) {
            throw new BadRequestError('Not a directory.');
        }

        const entries = fs.readdirSync(queryPath, { withFileTypes: true });
        const items = entries
            .map((entry) => ({
                name: entry.name,
                isDir: entry.isDirectory(),
                path: path.join(queryPath, entry.name),
                ext: path.extname(entry.name).toLowerCase(),
            }))
            .sort((left, right) => (left.isDir !== right.isDir ? (left.isDir ? -1 : 1) : left.name.localeCompare(right.name)))
            .slice(0, MAX_DIRECTORY_ITEMS);

        return {
            currentPath: queryPath,
            parentPath: path.dirname(queryPath),
            items,
            totalItems: entries.length,
            truncated: entries.length > MAX_DIRECTORY_ITEMS,
        };
    }

    pickFile(sourcePath: string, type: PickedFileType) {
        if (!fs.existsSync(sourcePath)) {
            throw new NotFoundError('Source file not found.');
        }

        const stats = fs.statSync(sourcePath);
        if (!stats.isFile()) {
            throw new BadRequestError('Source path must point to a file.');
        }

        const filename = path.basename(sourcePath);
        const mediaType = type === 'music' || type === 'personalAudio' ? 'audio' : 'visual';
        const targetDir = mediaType === 'audio' ? INPUT_MUSIC_ROOT : INPUT_ASSET_ROOT;
        ensureAllowedExtension(filename, mediaType === 'audio' ? ['.m4a', '.mp3', '.wav'] : ['.gif', '.jpeg', '.jpg', '.mov', '.mp4', '.png', '.webm', '.webp']);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const targetPath = buildUniqueFilePath(targetDir, filename);
        fs.copyFileSync(sourcePath, targetPath);
        const savedFilename = path.basename(targetPath);
        const folderName = mediaType === 'audio' ? 'music' : 'input-assests';

        return {
            filename: savedFilename,
            targetPath,
            assetUrl: `/assets/input/${folderName}/${encodeURIComponent(savedFilename)}`,
            tag: mediaType === 'audio' ? savedFilename : `[Visual: ${savedFilename}]`,
        };
    }

    listGalleryAssets() {
        if (!fs.existsSync(INPUT_ASSET_ROOT)) {
            return [];
        }

        return fs.readdirSync(INPUT_ASSET_ROOT, { withFileTypes: true })
            .filter((entry) => !entry.isDirectory())
            .map((entry) => ({
                filename: entry.name,
                assetUrl: `/assets/input/input-assests/${encodeURIComponent(entry.name)}`,
                tag: `[Visual: ${entry.name}]`,
            }))
            .sort((left, right) => left.filename.localeCompare(right.filename));
    }

    deleteAsset(filename: string) {
        const filePath = resolveAssetPath(filename);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundError('Asset not found.');
        }

        fs.unlinkSync(filePath);
    }

    getViewFile(rawPath: string, range?: string): ViewFileResult {
        const filePath = path.isAbsolute(rawPath) ? path.resolve(rawPath) : resolveProjectPath('public', rawPath);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundError('File not found.');
        }

        const extension = path.extname(filePath).toLowerCase();
        ensureAllowedExtension(filePath, VIEWABLE_EXTENSIONS);

        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
            throw new BadRequestError('Not a file.');
        }

        const contentType = resolveContentType(extension);
        const streamable = STREAMABLE_EXTENSIONS.includes(extension);
        if (range && streamable) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
            if (!match) {
                throw new BadRequestError('Invalid range header.');
            }

            const start = match[1] ? Number.parseInt(match[1], 10) : 0;
            const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
            if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= stat.size) {
                throw new BadRequestError('Invalid range header.');
            }

            return {
                type: 'range',
                filePath,
                contentType: contentType || 'application/octet-stream',
                stat,
                start,
                end,
            };
        }

        return {
            type: 'file',
            filePath,
            contentType,
        };
    }

    async listDrives() {
        if (process.platform !== 'win32') {
            return ['/'];
        }

        try {
            const { stdout } = await execAsync('powershell "get-psdrive -psprovider filesystem | select -expand name"');
            return stdout
                .split(/\r?\n/)
                .map((value) => value.trim())
                .filter((value) => value.length === 1)
                .map((value) => `${value}:`);
        } catch {
            const drives: string[] = [];
            for (let code = 65; code <= 90; code += 1) {
                const drive = `${String.fromCharCode(code)}:`;
                if (fs.existsSync(`${drive}\\`)) {
                    drives.push(drive);
                }
            }

            return drives;
        }
    }

    getHomeDirs() {
        const home = process.env.USERPROFILE || process.env.HOME || process.cwd();
        return {
            home,
            desktop: path.join(home, 'Desktop'),
            documents: path.join(home, 'Documents'),
            downloads: path.join(home, 'Downloads'),
            pictures: path.join(home, 'Pictures'),
            videos: path.join(home, 'Videos'),
        };
    }
}

export const localFilesystem = new LocalFilesystem();
