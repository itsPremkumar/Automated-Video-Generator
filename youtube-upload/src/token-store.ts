/**
 * Simple JSON-file token store (mirrors the main project's fs-based persistence).
 * In the real merge this will be replaced by the existing job-store.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { YouTubeTokens } from './types.js';

const STORE_FILE = path.join(process.cwd(), '.yt-tokens.json');

export function saveTokens(tokens: YouTubeTokens): void {
    fs.writeFileSync(STORE_FILE, JSON.stringify(tokens, null, 2));
}

export function loadTokens(): YouTubeTokens | null {
    if (!fs.existsSync(STORE_FILE)) return null;
    try {
        return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as YouTubeTokens;
    } catch {
        return null;
    }
}

export function clearTokens(): void {
    if (fs.existsSync(STORE_FILE)) fs.unlinkSync(STORE_FILE);
}
