/**
 * social-dl.ts - download a video/audio from YouTube or other social platforms
 * (single task). 100% FREE via the yt-dlp executable (on PATH in this env).
 * We shell out to the `yt-dlp` CLI directly rather than `python -m yt_dlp`,
 * because the default `python` here may resolve to a venv without the module.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface DownloadResult { ok: boolean; output?: string; detail: string; }

export async function downloadSocial(
    url: string,
    mode: 'both' | 'video' | 'audio' = 'both',
    out?: string,
): Promise<DownloadResult> {
    const target = out ?? path.join(process.cwd(), 'downloads');
    fs.mkdirSync(target, { recursive: true });
    const tpl = path.join(target, '%(title)s.%(ext)s');
    const args: string[] = [];
    if (mode === 'audio') {
        args.push('-x', '--audio-format', 'mp3');
    } else {
        args.push('-f', 'best[ext=mp4]/best');
    }
    args.push('-o', tpl, '--no-playlist', '--restrict-filenames', url);

    return new Promise<DownloadResult>((resolve) => {
        const proc = spawn('yt-dlp', args, { windowsHide: true });
        let stderr = '';
        let stdout = '';
        proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
        proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
        proc.on('error', (e) => resolve({ ok: false, detail: `Failed to launch yt-dlp: ${e.message}. Install it with: pip install -r requirements.txt (or: pip install yt-dlp)` }));
        proc.on('close', (code) => {
            if (code !== 0) { resolve({ ok: false, detail: `yt-dlp exited ${code}\n${stderr.slice(-800)}` }); return; }
            const files = fs.readdirSync(target).filter((f) => !f.endsWith('.part'));
            if (files.length === 0) { resolve({ ok: false, detail: `yt-dlp ran but produced no file.\n${stdout.slice(-400)}` }); return; }
            resolve({ ok: true, output: path.join(target, files[0]), detail: `Downloaded ${files.length} file(s) to ${target}` });
        });
    });
}
