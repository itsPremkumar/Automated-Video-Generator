import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { logInfo } from '../../runtime';
import { getCached as assetGetCached, storeCached as assetStoreCached } from '../asset-cache';
import { isSafeUrl } from '../net-safety';
import { MediaAsset, DownloadResult } from './types';
import { getVideoMetadata, DEFAULT_RENDER_FPS } from './media-utils';

const console = {
    log: (...args: unknown[]) => logInfo(...args),
};

export const MAX_DOWNLOAD_BYTES = Math.max(
    40 * 1024 * 1024,
    Number.parseInt(process.env.MAX_DOWNLOAD_BYTES || '', 10) || 150 * 1024 * 1024,
);
export const DOWNLOAD_STALL_TIMEOUT_MS = Math.max(
    15000,
    Number.parseInt(process.env.DOWNLOAD_STALL_TIMEOUT_MS || '', 10) || 30000,
);

/**
 * Download a media asset, reusing cached copies if available.
 * Returns metadata for the download destination.
 */
export async function downloadMedia(
    url: string,
    outputDir: string,
    filename: string,
): Promise<DownloadResult> {
    try {
        const outputPath = path.resolve(outputDir, filename);
        fs.mkdirSync(outputDir, { recursive: true });

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

        // Download the file
        const response = await axios.get(url, {
            responseType: 'stream',
            timeout: DOWNLOAD_STALL_TIMEOUT_MS,
            maxContentLength: MAX_DOWNLOAD_BYTES,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Referer': 'https://www.google.com/',
            },
        });

        const writer = fs.createWriteStream(outputPath);
        const contentLength = response.headers['content-length'];
        let downloaded = 0;
        let stalled = false;
        let lastChunk = Date.now();

        const stallTimer = setInterval(() => {
            if (Date.now() - lastChunk > DOWNLOAD_STALL_TIMEOUT_MS) {
                stalled = true;
                writer.destroy();
                response.data.destroy();
            }
        }, 5000);

        const stream = response.data;
        stream.on('data', (chunk: Buffer) => {
            lastChunk = Date.now();
            downloaded += chunk.length;
            if (contentLength && downloaded > MAX_DOWNLOAD_BYTES) {
                writer.destroy();
                stream.destroy();
            }
        });

        await new Promise<void>((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            stream.on('error', reject);
            stream.pipe(writer);
        });

        clearInterval(stallTimer);

        if (stalled) {
            throw new Error('Download stalled');
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
