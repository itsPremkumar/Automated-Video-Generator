import * as path from 'path';
import { MediaAsset } from '../visual-fetcher.js';
import { VideoResult } from './models.js';
import { WikimediaProvider } from './providers/wikimedia.js';
import { ArchiveOrgProvider } from './providers/archive.js';
import { FreeDownloadManager } from './download/downloader.js';
import { toPublicRelativePath } from '../../pipeline-workspace.js';
import { logInfo } from '../../shared/logging/runtime-logging.js';

export class FreeVideoAdapter {
    private wiki: WikimediaProvider;
    private archive: ArchiveOrgProvider;
    private downloader: FreeDownloadManager;

    constructor() {
        this.wiki = new WikimediaProvider();
        this.archive = new ArchiveOrgProvider();
        this.downloader = new FreeDownloadManager();
    }

    async searchAll(keyword: string, filters?: {
        count?: number;
        maxDuration?: number;
        minResolution?: number;
    }): Promise<{ source: string; results: VideoResult[] }[]> {
        const count = filters?.count ?? 5;
        const maxDuration = filters?.maxDuration;
        const minResolution = filters?.minResolution;

        const [wikiResults, archiveResults] = await Promise.allSettled([
            this.wiki.search({ keyword, count, maxDurationSeconds: maxDuration, minResolutionHeight: minResolution }),
            this.archive.search({ keyword, count, maxDurationSeconds: maxDuration, minResolutionHeight: minResolution }),
        ]);

        const output: { source: string; results: VideoResult[] }[] = [];

        if (wikiResults.status === 'fulfilled' && wikiResults.value.length > 0) {
            output.push({ source: 'wikimedia', results: wikiResults.value });
        }
        if (archiveResults.status === 'fulfilled' && archiveResults.value.length > 0) {
            output.push({ source: 'archive', results: archiveResults.value });
        }

        return output;
    }

    async downloadToWorkspace(
        videoResult: VideoResult,
        workspaceDir: string,
        filename?: string,
    ): Promise<{ localPath: string; publicPath: string } | null> {
        const videosDir = workspaceDir; // The caller should pass the videos directory
        const results = await this.downloader.downloadAll([videoResult], videosDir);
        if (results.length === 0 || !results[0].success || !results[0].localPath) {
            return null;
        }

        const localPath = results[0].localPath;
        let publicPath: string;
        try {
            publicPath = toPublicRelativePath(localPath);
        } catch {
            // Fallback: just return the filename relative to workspace
            publicPath = `jobs/${path.relative(
                path.resolve(process.cwd(), 'public'),
                localPath
            ).replace(/\\/g, '/')}`;
        }

        logInfo(`[FREE-VIDEO] Downloaded "${videoResult.title}" to ${localPath}`);
        return { localPath, publicPath };
    }

    async searchAndDownloadFirst(
        keyword: string,
        workspaceVideosDir: string,
        orientation: 'portrait' | 'landscape' = 'portrait',
    ): Promise<MediaAsset | null> {
        const sources = await this.searchAll(keyword, { count: 3, maxDuration: 30, minResolution: 360 });
        if (sources.length === 0) return null;

        // Flatten and pick the best result
        const allResults = sources.flatMap(s => s.results);
        // Prefer videos with resolution matching orientation
        const sorted = allResults.sort((a, b) => {
            const aRes = a.resolution ? parseInt(a.resolution.split('x')[1] ?? '0', 10) : 0;
            const bRes = b.resolution ? parseInt(b.resolution.split('x')[1] ?? '0', 10) : 0;
            return bRes - aRes;
        });

        const best = sorted[0];
        const result = await this.downloader.downloadAll([best], workspaceVideosDir);
        if (result.length === 0 || !result[0].success || !result[0].localPath) return null;

        const localPath = result[0].localPath;
        const width = best.resolution ? parseInt(best.resolution.split('x')[0] ?? '1080', 10) : 1080;
        const height = best.resolution ? parseInt(best.resolution.split('x')[1] ?? '1920', 10) : 1920;

        return {
            type: 'video',
            url: best.downloadUrl,
            width,
            height,
            photographer: best.creator,
            localPath,
            videoDuration: best.durationSeconds ?? undefined,
        };
    }
}
