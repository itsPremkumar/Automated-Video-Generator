import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { logInfo } from '../../runtime';
import { getCached as assetGetCached, storeCached as assetStoreCached } from '../asset-cache';
import { isSafeUrl } from '../net-safety';
import { MediaAsset, DownloadResult } from './types';
import { getVideoMetadata, DEFAULT_RENDER_FPS } from './media-utils';
import { withRetry } from '../../agentic/operations/retry';

const console = {
    log: (...args: unknown[]) => logInfo(...args),
};

export const MAX_DOWNLOAD_BYTES = Math.max(
    40 * 1024 * 1024,
    Number.parseInt(process.env.MAX_DOWNLOAD_BYTES || '', 10) || 150 * 1024 * 1024,
);
// Stall window: how long the stream may go WITHOUT receiving a single chunk
// before we abort. This is a *stall* guard (resets on every chunk), NOT a total
// timeout — so a slow-but-alive large video download survives instead of being
// killed at 30s like the old `timeout:` did.
export const DOWNLOAD_STALL_TIMEOUT_MS = Math.max(
    15000,
    Number.parseInt(process.env.DOWNLOAD_STALL_TIMEOUT_MS || '', 10) || 30000,
);

/**
 * Retry only on transient/retryable failures: HTTP 429 (rate-limit), 5xx,
 * timeouts, stalls, and network resets. 4xx client errors (401/403/404) are
 * NOT retried — they will always fail.
 */
function isDownloadRetryable(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { status?: number; response?: { status?: number }; code?: unknown; message?: string; name?: string };
    // Never retry on content-too-large (maxContentLength) — the file is
    // genuinely too big and will never succeed on retry. Without this guard
    // an AxiosError with "maxContentLength" in the message hits the
    // `e.name === 'AxiosError'` catch-all below and gets retried 3+ times,
    // wasting minutes per oversized asset.
    if (typeof e.message === 'string' && /maxContentLength|content.length|too large|size exceeded/i.test(e.message)) return false;
    const status = Number(e.status ?? e.response?.status ?? 0);
    if (status === 429 || (status >= 500 && status < 600)) return true;
    const code = String(e.code ?? '');
    if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNABORTED'].includes(code))
        return true;
    if (typeof e.message === 'string' && /timeout|stall|reset|aborted|network|econn/i.test(e.message)) return true;
    return e.name === 'AxiosError' || e.name === 'FetchError' || e.name === 'TimeoutError';
}

/**
 * Stream a URL to `partPath` with resume + stall guard. Re-issuing with a Range
 * header continues a partially downloaded `.part` instead of restarting.
 */
async function streamToFile(url: string, partPath: string, resumeFrom = 0): Promise<number> {
    const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Referer': 'https://www.google.com/',
    };
    if (resumeFrom > 0) headers.Range = `bytes=${resumeFrom}-`;

    const response = await axios.get(url, {
        responseType: 'stream',
        maxContentLength: MAX_DOWNLOAD_BYTES,
        // `timeout` on a stream request covers ONLY the connect/headers
        // phase — body stalls are handled by the stall timer below. Without
        // this, a server that accepts the socket but never sends headers
        // hangs the pipeline forever (observed in matrix QA).
        timeout: 30000,
        headers,
    });

    const supportsResume = response.status === 206;
    const writer = fs.createWriteStream(partPath, { flags: supportsResume ? 'a' : 'w' });
    let written = supportsResume ? resumeFrom : 0;
    let lastChunk = Date.now();
    let stalled = false;

    const stallTimer = setInterval(() => {
        if (Date.now() - lastChunk > DOWNLOAD_STALL_TIMEOUT_MS) {
            stalled = true;
            // CRITICAL: destroy WITH an error. destroy() with no argument
            // emits only 'close' (no 'error'/'finish'), so the promise below
            // never settled and the whole pipeline hung forever on a stalled
            // connection (observed: 36-minute silent hang in matrix QA).
            const err = new Error(`Download stalled after ${DOWNLOAD_STALL_TIMEOUT_MS}ms (${written} bytes)`);
            response.data.destroy(err);
            writer.destroy(err);
        }
    }, 5000);
    stallTimer.unref?.(); // never hold the process open on its own

    try {
        await new Promise<void>((resolve, reject) => {
            response.data.on('data', (chunk: Buffer) => {
                lastChunk = Date.now();
                written += chunk.length;
            });
            response.data.on('error', (err: Error) => {
                clearInterval(stallTimer);
                writer.destroy();
                reject(err);
            });
            writer.on('error', (err: Error) => {
                clearInterval(stallTimer);
                reject(err);
            });
            writer.on('finish', () => {
                clearInterval(stallTimer);
                resolve();
            });
            // Belt-and-braces: if either stream closes without 'finish' or
            // 'error' having settled the promise, settle it here instead of
            // hanging (destroy() without an error emits only 'close').
            writer.on('close', () => {
                clearInterval(stallTimer);
                reject(new Error(stalled ? `Download stalled after ${DOWNLOAD_STALL_TIMEOUT_MS}ms (${written} bytes)` : 'download stream closed prematurely'));
            });
            response.data.pipe(writer);
        });
    } catch (err) {
        clearInterval(stallTimer);
        if (stalled) throw new Error(`Download stalled after ${DOWNLOAD_STALL_TIMEOUT_MS}ms (${written} bytes)`);
        throw err;
    }
    clearInterval(stallTimer);
    return written;
}

/**
 * Download a media asset, reusing cached copies if available.
 * Returns metadata for the download destination.
 *
 * Robustness (matches the free-video FreeDownloadManager):
 *  - retries transient failures (429/5xx/timeout/stall/network) with backoff
 *  - resumes partial `.part` downloads via HTTP Range instead of restarting
 *  - uses a chunk-stall guard (not a total timeout) so large videos survive
 */
export async function downloadMedia(
    url: string,
    outputDir: string,
    filename: string,
): Promise<DownloadResult> {
    try {
        const outputPath = path.resolve(outputDir, filename);
        fs.mkdirSync(outputDir, { recursive: true });
        const partPath = `${outputPath}.part`;

        // Check cache first
        const cached = assetGetCached(url, 0);
        if (cached) {
            if (fs.existsSync(cached)) {
                fs.copyFileSync(cached, outputPath);
                const meta = await getVideoMetadata(outputPath);
                return {
                    path: outputPath,
                    width: 0, // width determined later
                    height: 0,
                    videoDuration: meta.durationSeconds,
                    videoTrimAfterFrames: meta.trimAfterFrames,
                };
            }
        }

        const safe = isSafeUrl(url);
        if (!safe.ok) throw new Error(`refused unsafe download URL: ${safe.reason}`);

        const existing = fs.existsSync(partPath) ? fs.statSync(partPath).size : 0;
        await withRetry(() => streamToFile(url, partPath, existing), {
            retries: 3,
            baseMs: 800,
            maxMs: 8000,
            jitter: 0.3,
            label: `download:${filename}`,
            shouldRetry: isDownloadRetryable,
        });

        if (fs.existsSync(partPath)) {
            // On Windows, rename over an existing file fails with EPERM.
            // A stale outputPath means a previous (possibly concurrent) attempt
            // produced it — drop it so the fresh download wins.
            if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });
            fs.renameSync(partPath, outputPath);
        } else if (!fs.existsSync(outputPath)) {
            // The .part file vanished between streamToFile finishing and the
            // rename (e.g. a concurrent session pruning workspace/jobs). Treat
            // it as a clean, retryable failure instead of a raw ENOENT.
            throw new Error(
                `download produced no file for ${filename}: .part file vanished after stream completed (concurrent cleanup?)`,
            );
        }

        // Cache the downloaded file
        const stat = fs.statSync(outputPath);
        if (stat.size > 0) {
            assetStoreCached(url, outputPath);
        }

        const meta = await getVideoMetadata(outputPath);
        return {
            path: outputPath,
            width: 0,
            height: 0,
            videoDuration: meta.durationSeconds,
            videoTrimAfterFrames: meta.trimAfterFrames,
        };
    } catch (error: any) {
        console.log(`⚠ [DOWNLOAD] Failed to download ${url}: ${error?.message || error}`);
        throw error;
    }
}

