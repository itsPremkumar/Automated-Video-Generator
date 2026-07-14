import * as fs from 'fs';
import * as path from 'path';
import { AxiosInstance } from 'axios';
import { createHttpClient, headContentLength } from '../http-client.js';
import { withRetry, getAvailablePath, getExistingFileSize, sanitizeFilename } from '../utils.js';
import { VideoResult, DownloadResult } from '../models.js';

/**
 * Error thrown when a streaming download accepts the connection but then stops
 * sending data for longer than the stall window. Without this guard, axios
 * `timeout` only covers the initial connection/headers for `responseType:
 * 'stream'` requests, so a stalled server would hang the download forever.
 */
class DownloadStallError extends Error {
    public readonly code = 'DOWNLOAD_STALL';
    constructor(message: string) {
        super(message);
        this.name = 'DownloadStallError';
    }
}

export class FreeDownloadManager {
    private readonly client;
    private readonly concurrentDownloads: number;
    private readonly retryCount: number;
    private readonly retryBaseDelayMs: number;
    private readonly stallTimeoutMs: number;

    constructor(options?: {
        concurrentDownloads?: number;
        retryCount?: number;
        retryBaseDelayMs?: number;
        stallTimeoutMs?: number;
        client?: AxiosInstance;
    }) {
        this.client = options?.client ?? createHttpClient(60000);
        this.concurrentDownloads = options?.concurrentDownloads ?? 3;
        this.retryCount = options?.retryCount ?? 3;
        this.retryBaseDelayMs = options?.retryBaseDelayMs ?? 2000;
        this.stallTimeoutMs =
            options?.stallTimeoutMs ??
            Math.max(15000, Number.parseInt(process.env.FREE_VIDEO_DOWNLOAD_STALL_TIMEOUT_MS || '', 10) || 30000);
    }

    public async downloadAll(videos: VideoResult[], outputDir: string): Promise<DownloadResult[]> {
        if (videos.length === 0) return [];
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const usedBaseNames = new Set<string>();
        const results: DownloadResult[] = [];
        const inProgress: Promise<void>[] = [];

        const startOne = (video: VideoResult): void => {
            const p = this.downloadOne(video, outputDir, usedBaseNames)
                .then((r) => {
                    results.push(r);
                })
                .catch((err) => {
                    results.push({
                        video,
                        success: false,
                        localPath: null,
                        error: err.message,
                        bytesDownloaded: 0,
                        resumed: false,
                    });
                })
                .finally(() => {
                    const idx = inProgress.indexOf(p);
                    if (idx >= 0) inProgress.splice(idx, 1);
                });
            inProgress.push(p);
        };

        const queue = [...videos];
        while (queue.length > 0 || inProgress.length > 0) {
            while (queue.length > 0 && inProgress.length < this.concurrentDownloads) {
                startOne(queue.shift()!);
            }
            if (inProgress.length > 0) {
                await Promise.race(inProgress);
            }
        }

        return results;
    }

    private async downloadOne(
        video: VideoResult,
        outputDir: string,
        usedBaseNames: Set<string>,
    ): Promise<DownloadResult> {
        const baseName = this.reserveBaseName(video, usedBaseNames);
        const extension = video.format !== 'unknown' ? video.format : this.guessExtension(video.downloadUrl);
        const targetPath = await getAvailablePath(outputDir, baseName, extension);
        const partPath = `${targetPath}.part`;
        const existingBytes = await getExistingFileSize(partPath);
        const resuming = existingBytes > 0;

        try {
            const bytesWritten = await withRetry(() => this.streamToFile(video.downloadUrl, partPath, existingBytes), {
                retries: this.retryCount,
                baseDelayMs: this.retryBaseDelayMs,
                label: `download:${baseName}`,
            });

            if (fs.existsSync(partPath)) {
                fs.renameSync(partPath, targetPath);
            }

            return {
                video,
                success: true,
                localPath: targetPath,
                error: null,
                bytesDownloaded: bytesWritten,
                resumed: resuming,
            };
        } catch (err: any) {
            if (fs.existsSync(partPath)) {
                try {
                    fs.unlinkSync(partPath);
                } catch {
                    /* ignore — cleanup */
                }
            }
            return {
                video,
                success: false,
                localPath: null,
                error: err.message,
                bytesDownloaded: existingBytes,
                resumed: resuming,
            };
        }
    }

    private async streamToFile(url: string, partPath: string, resumeFromBytes: number): Promise<number> {
        const headers: Record<string, string> = {};
        if (resumeFromBytes > 0) {
            headers.Range = `bytes=${resumeFromBytes}-`;
        }

        const response = await this.client.get(url, { responseType: 'stream', headers });
        const supportsResume = response.status === 206;
        const writeStream = fs.createWriteStream(partPath, { flags: supportsResume ? 'a' : 'w' });
        let downloadedThisSession = supportsResume ? resumeFromBytes : 0;

        // Stall guard: a streaming axios request's `timeout` only covers the
        // connect/headers phase, not a server that stops sending bytes. If no
        // new data arrives within the stall window we abort so the caller's
        // retry / local-fallback path can take over instead of hanging.
        let stallTimer: NodeJS.Timeout | undefined;
        const armStallTimer = (): void => {
            if (stallTimer) clearTimeout(stallTimer);
            stallTimer = setTimeout(() => {
                response.data.destroy(
                    new DownloadStallError(
                        `Download stalled after ${this.stallTimeoutMs}ms with no data (${downloadedThisSession} bytes so far)`,
                    ),
                );
            }, this.stallTimeoutMs);
        };

        return new Promise<number>((resolve, reject) => {
            armStallTimer();
            response.data.on('data', (chunk: Buffer) => {
                downloadedThisSession += chunk.length;
                armStallTimer();
            });
            response.data.on('error', (err: Error) => {
                if (stallTimer) clearTimeout(stallTimer);
                writeStream.destroy();
                reject(err);
            });
            writeStream.on('error', (err: Error) => {
                if (stallTimer) clearTimeout(stallTimer);
                reject(err);
            });
            writeStream.on('finish', () => {
                if (stallTimer) clearTimeout(stallTimer);
                resolve(downloadedThisSession || 1);
            });
            response.data.pipe(writeStream);
        });
    }

    private reserveBaseName(video: VideoResult, usedBaseNames: Set<string>): string {
        let base = sanitizeFilename(video.title);
        let suffix = 1;
        const original = base;
        while (usedBaseNames.has(base)) {
            base = `${original}_${suffix}`;
            suffix += 1;
        }
        usedBaseNames.add(base);
        return base;
    }

    private guessExtension(url: string): string {
        try {
            const ext = path.extname(new URL(url).pathname).replace('.', '').toLowerCase();
            return ['mp4', 'webm', 'ogg', 'ogv'].includes(ext) ? ext : 'mp4';
        } catch {
            return 'mp4';
        }
    }
}
