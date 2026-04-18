import * as path from 'path';
import * as fs from 'fs';
import { videoDownloaderService, DownloadProgress } from '../lib/video-downloader-service';
import { resolveProjectPath } from '../shared/runtime/paths';
import { toPublicRelativePath } from '../pipeline-workspace';
import { logInfo, logError } from '../shared/logging/runtime-logging';

export class SocialDownloadAppService {
    /**
     * Process a social media video download request.
     */
    async processSocialDownload(url: string, mode: 'both' | 'video' | 'audio' = 'both', onProgress?: (p: DownloadProgress) => void): Promise<{ localPath: string; filename: string; absolutePath: string }> {
        logInfo(`[SOCIAL-SERVICE] Processing social download (${mode}) for: ${url}`);
        
        const outputDir = resolveProjectPath('output', 'downloads', 'social');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        try {
            let absolutePath = await videoDownloaderService.download(url, outputDir, mode, onProgress);
            
            // Fallback: If absolutePath is empty or doesn't exist, try to find the most recent file in outputDir
            if (!absolutePath || !fs.existsSync(absolutePath)) {
                logInfo(`[SOCIAL-SERVICE] Detected path missing or empty: "${absolutePath}". Searching in ${outputDir}...`);
                const files = fs.readdirSync(outputDir)
                    .map(f => ({ name: f, time: fs.statSync(path.join(outputDir, f)).mtime.getTime() }))
                    .sort((a, b) => b.time - a.time);
                
                if (files.length > 0) {
                    absolutePath = path.join(outputDir, files[0].name);
                    logInfo(`[SOCIAL-SERVICE] Found fallback file: ${absolutePath}`);
                } else {
                    throw new Error('Could not locate downloaded file in output directory.');
                }
            }

            const filename = path.basename(absolutePath);
            
            // To make it accessible via the web portal, we might need it to be in the jobs folder
            // or we add a new static route for /downloads/social
            // Let's copy it to a specialized "social" job folder to reuse existing static serving for /jobs
            const sessionId = `social_${Date.now()}`;
            const publicJobsRoot = path.join(resolveProjectPath('public'), 'jobs');
            const targetDir = path.join(publicJobsRoot, sessionId);
            
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            const targetPath = path.join(targetDir, filename);
            logInfo(`[SOCIAL-SERVICE] Copying ${absolutePath} to ${targetPath}`);
            fs.copyFileSync(absolutePath, targetPath);

            logInfo(`[SOCIAL-SERVICE] Video available at: ${targetPath}`);

            return {
                localPath: `/jobs/${sessionId}/${filename}`,
                filename: filename,
                absolutePath: absolutePath
            };
        } catch (err: any) {
            logError(`[SOCIAL-SERVICE] Download failed: ${err.message}`);
            throw err;
        }
    }
}

export const socialDownloadAppService = new SocialDownloadAppService();
