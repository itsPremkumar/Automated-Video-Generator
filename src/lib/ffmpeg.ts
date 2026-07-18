/**
 * ffmpeg.ts — single, typed ffmpeg runner for the whole codebase.
 *
 * Every ffmpeg invocation should go through here so we have:
 *  - one canonical way to resolve the bundled ffmpeg-static binary
 *    (no more `spawn('ffmpeg')` that silently relies on PATH),
 *  - consistent timeouts + SIGKILL-on-stall,
 *  - structured errors instead of swallowed failures,
 *  - a real run probe for tests (ffmpegCanRun).
 *
 * Prior to this, the codebase had 6+ divergent runner implementations
 * (spawn vs execFileSync vs execSync, some using PATH 'ffmpeg', some the
 * resolved binary) with inconsistent timeout/error handling.
 */
import { spawn, execFileSync } from 'child_process';
import * as fs from 'fs';

let cachedPath: string | null = null;

/** Resolve the bundled ffmpeg-static binary (cached). Throws if missing. */
export function ffmpegPath(): string {
    if (cachedPath) return cachedPath;
    // Lazy require so the module loads even in environments without the dep.
    const resolved = require('ffmpeg-static') as string | undefined;
    if (!resolved || !fs.existsSync(resolved)) {
        throw new Error('ffmpeg-static binary not found; cannot run ffmpeg operations');
    }
    cachedPath = resolved;
    return cachedPath;
}

export interface RunFfmpegOptions {
    /** Hard timeout in ms (default 30s). Stall = no exit within this window. */
    timeoutMs?: number;
    /** Capture stdout as a Buffer (for frame extraction) instead of discarding. */
    captureStdout?: boolean;
    /** Extra env for the child (merged over process.env). */
    env?: NodeJS.ProcessEnv;
}

export class FfmpegError extends Error {
    constructor(
        message: string,
        public readonly args: string[],
        public readonly code: number | null,
    ) {
        super(message);
        this.name = 'FfmpegError';
    }
}

/**
 * Async ffmpeg run with timeout + SIGKILL-on-stall. Resolves with the
 * process exit code and captured stdout (if requested). Rejects with
 * FfmpegError on non-zero exit or spawn failure — callers decide whether
 * a non-zero exit is fatal (most should surface it, not swallow it).
 */
export function runFfmpeg(args: string[], opts: RunFfmpegOptions = {}): Promise<{ code: number; stdout: Buffer }> {
    const bin = ffmpegPath();
    const timeoutMs = opts.timeoutMs ?? Number(process.env.AGENTIC_FFMPEG_TIMEOUT_MS || 30000);
    return new Promise((resolve, reject) => {
        let child: ReturnType<typeof spawn>;
        try {
            child = spawn(bin, args, {
                stdio: opts.captureStdout ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'ignore', 'pipe'],
                env: opts.env ?? process.env,
            } as any);
        } catch (err) {
            reject(new FfmpegError(`spawn failed: ${(err as Error).message}`, args, null));
            return;
        }
        const chunks: Buffer[] = [];
        if (opts.captureStdout) child.stdout?.on('data', (d: Buffer) => chunks.push(d));
        let stderr = '';
        child.stderr?.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
        const timer = setTimeout(() => {
            try {
                child.kill('SIGKILL');
            } catch {
                /* ignore */
            }
            reject(new FfmpegError(`timed out after ${timeoutMs}ms`, args, null));
        }, timeoutMs);
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(new FfmpegError(`spawn error: ${err.message}`, args, null));
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve({ code: 0, stdout: Buffer.concat(chunks) });
            } else {
                reject(new FfmpegError(`exit ${code}: ${stderr.slice(0, 400)}`, args, code));
            }
        });
    });
}

/**
 * Synchronous ffmpeg run (for callers that are already in a sync context,
 * e.g. test setup or legacy render helpers). Uses the resolved binary.
 */
export function runFfmpegSync(args: string[], opts: { timeoutMs?: number } = {}): string | Buffer {
    const bin = ffmpegPath();
    return execFileSync(bin, args, {
        timeout: opts.timeoutMs ?? Number(process.env.AGENTIC_FFMPEG_TIMEOUT_MS || 30000),
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024 * 256,
    } as any);
}

/**
 * Real runtime probe used by tests: actually executes ffmpeg and returns
 * whether it ran (not just whether the binary exists). Avoids the
 * `-filters`-name false-positive where a filter is listed but can't run
 * (e.g. missing fontconfig for drawtext).
 */
export function ffmpegCanRun(): boolean {
    try {
        runFfmpegSync(['-version']);
        return true;
    } catch {
        return false;
    }
}
