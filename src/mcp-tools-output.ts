import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath } from './runtime';

const OUTPUT_DIR = resolveProjectPath('output');

export async function listOutputVideos() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    return [];
  }
  const items = fs.readdirSync(OUTPUT_DIR);
  const videos = items.filter((item: string) => {
    const stats = fs.statSync(path.join(OUTPUT_DIR, item));
    return stats.isDirectory();
  });
  return videos;
}

export async function readOutputFile(videoId: string, filename?: string) {
  const videoDir = path.join(OUTPUT_DIR, videoId);
  if (!fs.existsSync(videoDir)) {
    throw new Error(`Video with ID "${videoId}" not found.`);
  }
  const files = fs.readdirSync(videoDir);
  if (filename) {
    const filePath = path.join(videoDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File "${filename}" not found in video directory "${videoId}".`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return content;
  }
  return files;
}

export async function deleteOutput(videoId: string) {
  const videoDir = path.join(OUTPUT_DIR, videoId);
  if (!fs.existsSync(videoDir)) {
    throw new Error(`Video with ID "${videoId}" not found.`);
  }
  fs.rmSync(videoDir, { recursive: true, force: true });
  return true;
}
