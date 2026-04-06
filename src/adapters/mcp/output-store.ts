import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath } from '../../shared/runtime/paths';

const OUTPUT_DIR = resolveProjectPath('output');

export async function listOutputVideos() {
    if (!fs.existsSync(OUTPUT_DIR)) return [];
    return fs.readdirSync(OUTPUT_DIR).filter((item) => fs.statSync(path.join(OUTPUT_DIR, item)).isDirectory());
}

export async function readOutputFile(videoId: string, filename?: string) {
    const videoDir = path.join(OUTPUT_DIR, videoId);
    if (!fs.existsSync(videoDir)) throw new Error(`Video with ID "${videoId}" not found.`);
    if (!filename) return fs.readdirSync(videoDir);
    const filePath = path.join(videoDir, filename);
    if (!fs.existsSync(filePath)) throw new Error(`File "${filename}" not found in video directory "${videoId}".`);
    return fs.readFileSync(filePath, 'utf-8');
}

export async function deleteOutput(videoId: string) {
    const videoDir = path.join(OUTPUT_DIR, videoId);
    if (!fs.existsSync(videoDir)) throw new Error(`Video with ID "${videoId}" not found.`);
    fs.rmSync(videoDir, { recursive: true, force: true });
    return true;
}
