import cliProgress from 'cli-progress';
import chalk from 'chalk';
import { formatBytes } from '../utils/file';

/**
 * Manages a multi-bar progress display for concurrent downloads.
 * Each active download gets its own bar showing percentage, speed,
 * and ETA; an overall bar tracks "Downloading N/total".
 */
export class DownloadProgressManager {
  private readonly multiBar: cliProgress.MultiBar;
  private readonly overallBar: cliProgress.SingleBar;
  private readonly fileBars = new Map<string, cliProgress.SingleBar>();
  private completedCount = 0;
  private readonly totalCount: number;

  constructor(totalCount: number) {
    this.totalCount = totalCount;
    this.multiBar = new cliProgress.MultiBar(
      {
        clearOnComplete: false,
        hideCursor: true,
        format: `${chalk.cyan('{bar}')} | {percentage}% | {filename} | {speed} | ETA: {eta_formatted}`,
      },
      cliProgress.Presets.shades_classic,
    );

    this.overallBar = this.multiBar.create(totalCount, 0, {
      filename: 'Overall progress',
      speed: '',
      eta_formatted: '',
    });
  }

  /** Registers a new per-file bar and returns a handle to update it. */
  public createFileBar(fileId: string, filename: string, totalBytes: number): FileProgressHandle {
    const bar = this.multiBar.create(totalBytes > 0 ? totalBytes : 100, 0, {
      filename: filename.length > 30 ? `${filename.slice(0, 27)}...` : filename,
      speed: '0 B/s',
      eta_formatted: 'Unknown',
    });
    this.fileBars.set(fileId, bar);

    let lastBytes = 0;
    let lastTime = Date.now();

    return {
      update: (bytesDownloaded: number) => {
        const now = Date.now();
        const elapsedSec = (now - lastTime) / 1000;
        if (elapsedSec > 0.2) {
          const bytesPerSec = (bytesDownloaded - lastBytes) / elapsedSec;
          const remaining = totalBytes > 0 ? totalBytes - bytesDownloaded : 0;
          const etaSec = bytesPerSec > 0 ? Math.round(remaining / bytesPerSec) : 0;
          bar.update(bytesDownloaded, {
            speed: `${formatBytes(bytesPerSec)}/s`,
            eta_formatted: `${etaSec}s`,
          });
          lastBytes = bytesDownloaded;
          lastTime = now;
        } else {
          bar.update(bytesDownloaded);
        }
      },
      complete: () => {
        bar.update(totalBytes > 0 ? totalBytes : 100, { speed: 'done', eta_formatted: '0s' });
        this.completedCount += 1;
        this.overallBar.update(this.completedCount, {
          filename: `Downloading ${this.completedCount}/${this.totalCount}`,
        });
      },
      fail: () => {
        bar.update(0, { speed: 'failed', eta_formatted: '-' });
        this.completedCount += 1;
        this.overallBar.update(this.completedCount, {
          filename: `Downloading ${this.completedCount}/${this.totalCount}`,
        });
      },
    };
  }

  public stop(): void {
    this.multiBar.stop();
  }
}

export interface FileProgressHandle {
  update(bytesDownloaded: number): void;
  complete(): void;
  fail(): void;
}