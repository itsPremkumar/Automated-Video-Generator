import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg as runFfmpegShared, FfmpegError } from '../../lib/ffmpeg.js';
import { ffmpegDrawtextEscape } from '../../lib/ffmpeg-text.js';
import { resolveProjectPath } from '../../shared/runtime/paths.js';

/** Hard-timeout wrapper for network/IO promises. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        p.then(
            (v) => {
                clearTimeout(t);
                resolve(v);
            },
            (e) => {
                clearTimeout(t);
                reject(e);
            },
        );
    });
}

const ffprobe: string = (() => {
    try {
        return require('ffprobe-static').path;
    } catch {
        return 'ffprobe';
    }
})();

/** Probe an audio file's duration (seconds) via ffprobe */
export async function estimateAudioDurationSafe(p: string): Promise<number> {
    try {
        const { spawn } = require('child_process');
        const timeoutMs = Number(process.env.AGENTIC_FFPROBE_TIMEOUT_MS || 15000);
        const out = await new Promise<string>((resolve, reject) => {
            const child = spawn(
                ffprobe,
                ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', p],
                { encoding: 'utf8' as const, stdio: ['pipe', 'pipe', 'pipe'] } as any,
            );
            let buf = '';
            const t = setTimeout(() => {
                try { child.kill('SIGKILL'); } catch { /* ignore */ }
                reject(new Error('ffprobe timed out'));
            }, timeoutMs);
            child.stdout?.on('data', (d: Buffer) => { buf += d.toString(); });
            child.on('error', (e: Error) => { clearTimeout(t); reject(e); });
            child.on('close', (code: number) => {
                clearTimeout(t);
                if (code !== 0) reject(new Error('ffprobe failed'));
                else resolve(buf);
            });
        });
        const d = parseFloat(out.trim());
        // NOTE: do NOT Math.ceil here — ceiling turns a 4.04s clip into 5s and
        // breaks downstream duration comparisons (e.g. restitch asserting the
        // output length). Return the precise float; round only at display.
        if (!isNaN(d) && d > 0) return d;
    } catch { /* fall through */ }
    return 4;
}

/** Probe a video file's width/height/codec/fps via ffprobe (JSON, key-based). */
export async function probeVideo(p: string): Promise<{ width: number; height: number; codec: string; fps: number; hasAudio: boolean }> {
    try {
        const { spawn } = require('child_process');
        const out = await new Promise<string>((resolve, reject) => {
            const child = spawn(
                ffprobe,
                ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name,r_frame_rate', '-of', 'json', p],
                { encoding: 'utf8' as const, stdio: ['pipe', 'pipe', 'pipe'] } as any,
            );
            let buf = '';
            const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } reject(new Error('ffprobe timed out')); }, 15000);
            child.stdout?.on('data', (d: Buffer) => { buf += d.toString(); });
            child.on('error', (e: Error) => { clearTimeout(t); reject(e); });
            child.on('close', (code: number) => {
                clearTimeout(t);
                if (code === 0) resolve(buf);
                else reject(new Error('ffprobe failed'));
            });
        });
        const parsed = JSON.parse(out);
        const s = parsed?.streams?.[0] || {};
        const [nf, df] = String(s.r_frame_rate || '25/1').split('/').map(Number);
        let hasAudio = false;
        try {
            const aout = await new Promise<string>((resolve) => {
                const c = spawn(ffprobe, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'default=nw=1:nk=1', p], { encoding: 'utf8' as const, stdio: ['pipe', 'pipe', 'pipe'] } as any);
                let b = '';
                const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { /* ignore */ } resolve(''); }, 15000);
                c.stdout?.on('data', (d: Buffer) => { b += d.toString(); });
                c.on('close', () => { clearTimeout(t); resolve(b); });
            });
            hasAudio = aout.trim().length > 0;
        } catch { hasAudio = false; }
        return {
            width: Number(s.width) || 720,
            height: Number(s.height) || 1280,
            codec: s.codec_name || 'h264',
            fps: (nf && df ? nf / df : 25) || 25,
            hasAudio,
        };
    } catch {
        return { width: 720, height: 1280, codec: 'h264', fps: 25, hasAudio: true };
    }
}

/** Run an ffmpeg command, returning its exit code */
export function runFfmpeg(args: string[], timeoutMs = 60000): Promise<number> {
    return runFfmpegShared(args, { timeoutMs })
        .then((r) => r.code)
        .catch((err: unknown) => {
            if (err instanceof FfmpegError) return err.code ?? -1;
            return -1;
        });
}

/**
 * makePlaceholder — generate a real, renderable image/audio clip for a keyword
 * when the live fetcher fails.
 */
export function makePlaceholder(keywords: string[], kind: 'image' | 'video' | 'music'): string {
    const ffmpeg: string = require('ffmpeg-static');
    const { execFileSync } = require('child_process');
    const tmpDir = resolveProjectPath('workspace', 'tmp', 'placeholders');
    fs.mkdirSync(tmpDir, { recursive: true });
    const base = `${tmpDir}/ph_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const label = (keywords.join(' ') || 'video').slice(0, 40);
    if (kind === 'music') {
        const p = base + '.wav';
        execFileSync(ffmpeg, ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:a', 'pcm_s16le', '-y', p], {
            stdio: 'ignore',
        });
        return p;
    }
    const p = base + '.png';
    const color = kind === 'video' ? '0x2a9d8f' : '0x264653';
    const safeLabel = ffmpegDrawtextEscape(label).slice(0, 40);
    execFileSync(
        ffmpeg,
        [
            '-f', 'lavfi', '-i', `color=c=${color}:s=720x1280:d=0.1`,
            '-vf', `drawtext=text='${safeLabel}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2`,
            '-frames:v', '1', '-y', p,
        ],
        { stdio: 'ignore' },
    );
    return p;
}

/**
 * normalizeAudio — re-encode track to 128kbps mp3 for the bitrate gate.
 * Only runs when AGENTIC_NORMALIZE_MUSIC=1 (off by default for RAM safety).
 */
export function normalizeAudio(src: string): string {
    if (process.env.AGENTIC_NORMALIZE_MUSIC !== '1') return src;
    if (!src || !fs.existsSync(src)) return src;
    const ffmpeg: string = require('ffmpeg-static');
    const { execFileSync } = require('child_process');
    const tmpDir = resolveProjectPath('workspace', 'tmp', 'normalize');
    fs.mkdirSync(tmpDir, { recursive: true });
    const out = `${tmpDir}/music_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`;
    try {
        execFileSync(ffmpeg, ['-i', src, '-c:a', 'libmp3lame', '-b:a', '128k', '-y', out], {
            stdio: 'ignore',
            timeout: Number(process.env.AGENTIC_FFMPEG_TIMEOUT_MS || 30000),
        });
        return out;
    } catch {
        return src;
    }
}
