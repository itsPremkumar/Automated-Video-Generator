/**
 * src/music-system/providers/base.ts
 * Abstract base class for all music providers — shared utilities.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import type { MusicProvider, MusicTrack, MusicQuery } from '../types';

/** Resolve ffmpeg-static path (same pattern used across the project) */
function resolveFfmpeg(): string {
    try {
        return require('ffmpeg-static') as string;
    } catch {
        return 'ffmpeg'; // fallback to system ffmpeg
    }
}

/** Probe audio duration in seconds using ffprobe */
export async function probeDuration(localPath: string): Promise<number> {
    if (!fs.existsSync(localPath)) return 0;
    return new Promise((resolve) => {
        let ffprobe: string;
        try {
            ffprobe = require('ffprobe-static')?.path || 'ffprobe';
        } catch {
            ffprobe = 'ffprobe';
        }
        const cp = child_process.spawn(ffprobe, [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'csv=p=0',
            localPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        cp.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
        cp.on('close', () => {
            const dur = parseFloat(out.trim());
            resolve(isNaN(dur) ? 0 : dur);
        });
        cp.on('error', () => resolve(0));
    });
}

/** Run ffmpeg with args, returns stderr for diagnostics */
export function runFfmpeg(args: string[], timeoutMs = 30_000): Promise<{ code: number; stderr: string }> {
    return new Promise((resolve) => {
        const ffmpegPath = resolveFfmpeg();
        const cp = child_process.spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        cp.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
        const timer = setTimeout(() => {
            try { cp.kill('SIGKILL'); } catch { /* */ }
            resolve({ code: -1, stderr });
        }, timeoutMs);
        cp.on('close', (code) => {
            clearTimeout(timer);
            resolve({ code: code ?? -1, stderr });
        });
        cp.on('error', () => {
            clearTimeout(timer);
            resolve({ code: -1, stderr });
        });
    });
}

/** Wired timeout: passes AbortSignal to axios for clean cancellation */
export async function withSignal<T>(
    factory: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    label: string,
): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await Promise.race([
            factory(controller.signal),
            new Promise<T>((_, reject) => {
                controller.signal.addEventListener('abort', () => {
                    reject(new Error(`${label} timed out after ${timeoutMs}ms`));
                }, { once: true });
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

export abstract class BaseMusicProvider implements MusicProvider {
    abstract readonly name: string;
    abstract readonly label: string;
    abstract readonly priority: number;
    abstract readonly requiresNetwork: boolean;

    abstract search(query: MusicQuery): Promise<MusicTrack[]>;
    abstract download(track: MusicTrack, destPath: string): Promise<string>;

    /** Verify downloaded file integrity */
    async verify(localPath: string): Promise<boolean> {
        if (!fs.existsSync(localPath)) return false;
        if (fs.statSync(localPath).size < 1024) return false;
        const dur = await probeDuration(localPath);
        return dur > 0.5; // at least half a second of audio
    }

    /** Ensure parent directory exists */
    protected ensureDir(filePath: string): void {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    /** Sanitize a string for use in file names */
    protected sanitizeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    }
}
