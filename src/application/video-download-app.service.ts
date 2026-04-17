import * as fs from 'fs';
import * as path from 'path';
import { parseScript } from '../lib/script-parser';
import { fetchVisualsForScene, downloadMedia, invalidateCachedVisual } from '../lib/visual-fetcher';
import { resolveProjectPath } from '../shared/runtime/paths';
import { createPipelineWorkspace, ensurePipelineWorkspace, toPublicRelativePath } from '../pipeline-workspace';
import { logInfo, logError } from '../shared/logging/runtime-logging';

export interface DownloadResult {
    scenes: Array<{
        sceneNumber: number;
        voiceoverText: string;
        searchKeywords: string[];
        visual: {
            type: 'image' | 'video';
            url: string;
            localPath?: string;
        } | null;
    }>;
}

export class VideoDownloadAppService {
    /**
     * Analyze a script and download matching media for each scene.
     */
    async processDownload(script: string, orientation: 'portrait' | 'landscape' = 'portrait', source: 'all' | 'pexels' | 'pixabay' = 'all'): Promise<DownloadResult> {
        logInfo(`[DOWNLOAD-SERVICE] Processing script download request (${orientation}, source: ${source})`);
        
        // 1. Parse the script
        const parsed = await parseScript(script);
        logInfo(`[DOWNLOAD-SERVICE] Script parsed into ${parsed.scenes.length} scenes`);

        // 2. Create a temporary workspace for these downloads
        // We'll use a unique ID for this download session
        const sessionId = `dl_${Date.now()}`;
        const workspace = createPipelineWorkspace('', sessionId);
        ensurePipelineWorkspace(workspace);

        const results: DownloadResult = { scenes: [] };

        // 3. Process each scene
        for (const [index, scene] of parsed.scenes.entries()) {
            logInfo(`[DOWNLOAD-SERVICE] Processing scene ${index + 1}/${parsed.scenes.length}`);
            
            try {
                // Fetch visuals
                // For now we just use the default fetcher which might use Pexels
                // We'll try to find a video first
                let visual: any = await fetchVisualsForScene(scene.searchKeywords, true, orientation, scene.voiceoverText);

                if (visual && visual.type === 'video') {
                    const filename = `scene_${index + 1}.mp4`;
                    try {
                        const downloadResult = await downloadMedia(visual.url, workspace.videosDir, filename);
                        visual.localPath = toPublicRelativePath(downloadResult.path);
                    } catch (err: any) {
                        logError(`[DOWNLOAD-SERVICE] Download failed for scene ${index + 1}: ${err.message}`);
                        // Fallback to image if video download fails
                        visual = await fetchVisualsForScene(scene.searchKeywords, false, orientation, scene.voiceoverText);
                    }
                }

                results.scenes.push({
                    sceneNumber: scene.sceneNumber,
                    voiceoverText: scene.voiceoverText,
                    searchKeywords: scene.searchKeywords,
                    visual: visual ? {
                        type: visual.type,
                        url: visual.url,
                        localPath: visual.localPath
                    } : null
                });

            } catch (err: any) {
                logError(`[DOWNLOAD-SERVICE] Error processing scene ${index + 1}: ${err.message}`);
                results.scenes.push({
                    sceneNumber: scene.sceneNumber,
                    voiceoverText: scene.voiceoverText,
                    searchKeywords: scene.searchKeywords,
                    visual: null
                });
            }
        }

        return results;
    }
}

export const videoDownloadAppService = new VideoDownloadAppService();
