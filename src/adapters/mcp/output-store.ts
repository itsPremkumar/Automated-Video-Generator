import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath } from '../../shared/runtime/paths';

const OUTPUT_DIR = resolveProjectPath('output');
const SAFE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const SAFE_FILENAME_PATTERN = /^[^\\/]+$/;

function resolveVideoDir(videoId: string): string {
    const normalizedId = videoId.trim();
    if (!SAFE_VIDEO_ID_PATTERN.test(normalizedId)) {
        throw new Error(`Invalid video ID "${videoId}".`);
    }

    const videoDir = path.join(OUTPUT_DIR, normalizedId);
    const relative = path.relative(OUTPUT_DIR, videoDir);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Invalid video ID "${videoId}".`);
    }

    return videoDir;
}

function resolveVideoFile(videoDir: string, filename: string): string {
    const normalizedFilename = filename.trim();
    if (!SAFE_FILENAME_PATTERN.test(normalizedFilename)) {
        throw new Error(`Invalid filename "${filename}".`);
    }

    const filePath = path.join(videoDir, normalizedFilename);
    const relative = path.relative(videoDir, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Invalid filename "${filename}".`);
    }

    return filePath;
}

export async function listOutputVideos() {
    if (!fs.existsSync(OUTPUT_DIR)) return [];
    return fs.readdirSync(OUTPUT_DIR).filter((item) => fs.statSync(path.join(OUTPUT_DIR, item)).isDirectory());
}

export async function readOutputFile(videoId: string, filename?: string) {
    const videoDir = resolveVideoDir(videoId);
    if (!fs.existsSync(videoDir)) throw new Error(`Video with ID "${videoId}" not found.`);
    if (!filename) return fs.readdirSync(videoDir);
    const filePath = resolveVideoFile(videoDir, filename);
    if (!fs.existsSync(filePath)) throw new Error(`File "${filename}" not found in video directory "${videoId}".`);
    return fs.readFileSync(filePath, 'utf-8');
}

export async function deleteOutput(videoId: string) {
    const videoDir = resolveVideoDir(videoId);
    if (!fs.existsSync(videoDir)) throw new Error(`Video with ID "${videoId}" not found.`);
    fs.rmSync(videoDir, { recursive: true, force: true });
    return true;
}
