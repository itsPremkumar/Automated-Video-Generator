import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getPythonExecutable } from './python-runtime';
import { logInfo, logError } from '../shared/logging/runtime-logging';

export interface DownloadProgress {
    percent: number;
    speed: string;
    eta: string;
    totalSize: string;
}

export class VideoDownloaderService {
    /**
     * Download a video using yt-dlp.
     */
    async download(url: string, outputDir: string, onProgress?: (p: DownloadProgress) => void): Promise<string> {
        const python = getPythonExecutable();
        if (!python) {
            throw new Error('Python runtime not found.');
        }

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Output format: %(title)s.%(ext)s
        const outputTemplate = path.join(outputDir, '%(title)s.%(ext)s');

        return new Promise((resolve, reject) => {
            logInfo(`[DOWNLOADER] Starting download for: ${url}`);
            
            const args = [
                '-m', 'yt_dlp',
                '--no-playlist',
                '--restrict-filenames',
                '--no-mtime',
                '--format', 'bestvideo+bestaudio/best',
                '--merge-output-format', 'mp4',
                '-o', outputTemplate,
                '--newline',
                url
            ];

            logInfo(`[DOWNLOADER] Executing: ${python} ${args.join(' ')}`);
            
            const process = spawn(python, args);
            let downloadedFilePath = '';

            process.stdout.on('data', (data) => {
                const line = data.toString();
                // [download]  15.0% of 10.00MiB at  2.00MiB/s ETA 00:04
                const match = line.match(/\[download\]\s+(\d+\.\d+)%\s+of\s+(\S+)\s+at\s+(\S+)\s+ETA\s+(\S+)/);
                if (match) {
                    onProgress?.({
                        percent: parseFloat(match[1]),
                        totalSize: match[2],
                        speed: match[3],
                        eta: match[4]
                    });
                    logInfo(`[DOWNLOADER] Progress: ${match[1]}% | Speed: ${match[3]} | ETA: ${match[4]}`);
                } else if (line.trim()) {
                    logInfo(`[DOWNLOADER] stdout: ${line.trim()}`);
                }

                // [Merger] Merging formats into "C:\output.mp4"
                const fileMatch = line.match(/\[Merger\] Merging formats into "(.+)"/);
                if (fileMatch) {
                    downloadedFilePath = fileMatch[1];
                    logInfo(`[DOWNLOADER] Merger detected target path: ${downloadedFilePath}`);
                }
                
                // [download] Destination: C:\output.mp4 (if no merge needed)
                if (!downloadedFilePath) {
                    const destMatch = line.match(/\[download\] Destination: (.+)/);
                    if (destMatch) {
                        downloadedFilePath = destMatch[1];
                        logInfo(`[DOWNLOADER] Destination detected: ${downloadedFilePath}`);
                    }
                }
            });

            process.stderr.on('data', (data) => {
                const errorLine = data.toString().trim();
                if (errorLine) {
                    logError(`[DOWNLOADER] stderr: ${errorLine}`);
                }
            });

            process.on('close', (code) => {
                if (code === 0) {
                    logInfo(`[DOWNLOADER] Download complete: ${downloadedFilePath}`);
                    resolve(downloadedFilePath);
                } else {
                    reject(new Error(`yt-dlp exited with code ${code}`));
                }
            });
        });
    }
}

export const videoDownloaderService = new VideoDownloaderService();
