import fs from 'fs-extra';
import path from 'path';
import pLimit from 'p-limit';
import { AxiosInstance } from 'axios';
import { createHttpClient, headContentLength } from '../utils/http';
import { withRetry } from '../utils/retry';
import { getAvailablePath, getExistingFileSize, sanitizeFilename } from '../utils/file';
import { logger } from '../utils/logger';
import { AppConfig } from '../config';
import { DownloadResult, VideoResult } from '../models/video';
import { DownloadProgressManager } from './progress';

/**
 * Orchestrates downloading a batch of VideoResults: manages concurrency,
 * per-file retry, resumable partial downloads (via HTTP Range requests),
 * and progress reporting.
 */
export class DownloadManager {
  private readonly client: AxiosInstance;
  private readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.client = createHttpClient(config);
  }

  public async downloadAll(videos: VideoResult[]): Promise<DownloadResult[]> {
    if (videos.length === 0) return [];

    await fs.ensureDir(this.config.downloadDir);
    const limit = pLimit(this.config.concurrentDownloads);
    const progress = new DownloadProgressManager(videos.length);

    const usedBaseNames = new Set<string>();

    try {
      const tasks = videos.map((video) =>
        limit(() => this.downloadOne(video, progress, usedBaseNames)),
      );
      const results = await Promise.all(tasks);
      return results;
    } finally {
      progress.stop();
    }
  }

  private async downloadOne(
    video: VideoResult,
    progress: DownloadProgressManager,
    usedBaseNames: Set<string>,
  ): Promise<DownloadResult> {
    const baseName = this.reserveBaseName(video, usedBaseNames);
    const extension = video.format !== 'unknown' ? video.format : this.guessExtension(video.downloadUrl);

    let targetPath: string;
    try {
      targetPath = await getAvailablePath(this.config.downloadDir, baseName, extension);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to prepare output path for "${video.title}": ${message}`);
      return {
        video,
        success: false,
        localPath: null,
        error: message,
        bytesDownloaded: 0,
        resumed: false,
      };
    }

    // Check for a partially-downloaded .part file to resume.
    const partPath = `${targetPath}.part`;
    const existingBytes = await getExistingFileSize(partPath);
    const resuming = existingBytes > 0;

    const totalBytes = video.fileSizeBytes ?? (await headContentLength(this.client, video.downloadUrl)) ?? 0;
    const fileBar = progress.createFileBar(video.id, `${baseName}.${extension}`, totalBytes || 100);

    if (resuming) {
      fileBar.update(existingBytes);
    }

    try {
      const bytesWritten = await withRetry(
        () => this.streamToFile(video.downloadUrl, partPath, existingBytes, fileBar, totalBytes),
        {
          retries: this.config.retryCount,
          baseDelayMs: this.config.retryBaseDelayMs,
          label: `download:${baseName}`,
        },
      );

      await fs.move(partPath, targetPath, { overwrite: true });
      fileBar.complete();

      return {
        video,
        success: true,
        localPath: targetPath,
        error: null,
        bytesDownloaded: bytesWritten,
        resumed: resuming,
      };
    } catch (err) {
      fileBar.fail();
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to download "${video.title}" from ${video.provider}: ${message}`);
      return {
        video,
        success: false,
        localPath: null,
        error: message,
        bytesDownloaded: existingBytes,
        resumed: resuming,
      };
    }
  }

  /**
   * Streams a URL to disk, appending to an existing partial file via an
   * HTTP Range header when possible. Returns the total bytes on disk
   * after the stream completes.
   */
  private async streamToFile(
    url: string,
    partPath: string,
    resumeFromBytes: number,
    fileBar: ReturnType<DownloadProgressManager['createFileBar']>,
    totalBytes: number,
  ): Promise<number> {
    const headers: Record<string, string> = {};
    if (resumeFromBytes > 0) {
      headers.Range = `bytes=${resumeFromBytes}-`;
    }

    const response = await this.client.get(url, {
      responseType: 'stream',
      headers,
    });

    const supportsResume = response.status === 206;
    const writeStream = fs.createWriteStream(partPath, {
      flags: supportsResume ? 'a' : 'w',
    });

    let downloadedThisSession = supportsResume ? resumeFromBytes : 0;

    return new Promise<number>((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        downloadedThisSession += chunk.length;
        fileBar.update(downloadedThisSession);
      });

      response.data.on('error', (err: Error) => {
        writeStream.destroy();
        reject(err);
      });

      writeStream.on('error', (err: Error) => {
        reject(err);
      });

      writeStream.on('finish', () => {
        resolve(downloadedThisSession || totalBytes);
      });

      response.data.pipe(writeStream);
    });
  }

  /** Reserves a unique base filename (without extension) for a video, avoiding collisions within this batch. */
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
    const ext = path.extname(new URL(url).pathname).replace('.', '').toLowerCase();
    return ['mp4', 'webm', 'ogg', 'ogv'].includes(ext) ? ext : 'mp4';
  }
}