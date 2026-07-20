import * as path from 'path';
import * as fs from 'fs';
import { wikiProvider, archiveProvider, freeVideoDownloader } from '../lib/free-video/index';
import { VideoResult, SearchFilters } from '../lib/free-video/models';
import { resolveProjectPath, resolveRuntimePublicPath } from '../shared/runtime/paths';
import { toPublicRelativePath } from '../pipeline-workspace';
import { logInfo, logError } from '../shared/logging/runtime-logging';

export interface FreeVideoSearchResult {
    source: 'wikimedia' | 'archive';
    results: Array<{
        id: string;
        title: string;
        creator: string;
        license: string;
        licenseUrl: string;
        provider: string;
        downloadUrl: string;
        thumbnailUrl: string | null;
        durationSeconds: number | null;
        resolution: string | null;
        fileSizeBytes: number | null;
        format: string;
        sourcePageUrl: string;
    }>;
}

export interface FreeVideoDownloadResponse {
    localPath: string;
    publicPath: string;
    filename: string;
    title: string;
    creator: string;
    license: string;
    fileSizeBytes: number;
}

export class FreeVideoAppService {
    async search(
        keyword: string,
        filters?: {
            source?: 'wikimedia' | 'archive' | 'all';
            count?: number;
            maxDuration?: number;
            minResolution?: number;
            sortBy?: 'relevance' | 'newest' | 'resolution';
        },
    ): Promise<FreeVideoSearchResult[]> {
        const count = filters?.count ?? 5;
        const maxDuration = filters?.maxDuration;
        const minResolution = filters?.minResolution;
        const source = filters?.source ?? 'all';
        const sortBy = filters?.sortBy;

        const searchFilters: SearchFilters = {
            keyword,
            count,
            maxDurationSeconds: maxDuration,
            minResolutionHeight: minResolution,
            sortBy,
        };

        const output: FreeVideoSearchResult[] = [];
        const promises: Promise<void>[] = [];

        if (source === 'all' || source === 'wikimedia') {
            promises.push(
                (async () => {
                    try {
                        const results = await wikiProvider.search(searchFilters);
                        if (results.length > 0) {
                            output.push({ source: 'wikimedia', results: results.map(this.toResponse) });
                        }
                    } catch (err: any) {
                        logError(`[FREE-VIDEO] Wikimedia search error: ${err.message}`);
                    }
                })(),
            );
        }

        if (source === 'all' || source === 'archive') {
            promises.push(
                (async () => {
                    try {
                        const results = await archiveProvider.search(searchFilters);
                        if (results.length > 0) {
                            output.push({ source: 'archive', results: results.map(this.toResponse) });
                        }
                    } catch (err: any) {
                        logError(`[FREE-VIDEO] Archive search error: ${err.message}`);
                    }
                })(),
            );
        }

        await Promise.all(promises);
        return output;
    }

    async download(
        url: string,
        title: string,
        creator: string,
        license: string,
        format: string,
    ): Promise<FreeVideoDownloadResponse> {
        const outputDir = resolveRuntimePublicPath('jobs', 'free-video');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const videoResult: VideoResult = {
            id: `free_${Date.now()}`,
            title,
            creator,
            license,
            licenseUrl: '',
            provider: 'Free Video',
            downloadUrl: url,
            thumbnailUrl: null,
            durationSeconds: null,
            resolution: null,
            fileSizeBytes: null,
            format: format as any,
            sourcePageUrl: '',
        };

        const results = await freeVideoDownloader.downloadAll([videoResult], outputDir);
        if (results.length === 0 || !results[0].success || !results[0].localPath) {
            throw new Error(results[0]?.error || 'Download failed');
        }

        const localPath = results[0].localPath;
        const stats = fs.statSync(localPath);
        let publicPath: string;
        try {
            publicPath = toPublicRelativePath(localPath);
        } catch {
            publicPath = `free-video/${path.basename(localPath)}`;
        }

        logInfo(`[FREE-VIDEO] Downloaded to ${localPath}`);
        return {
            localPath,
            publicPath,
            filename: path.basename(localPath),
            title,
            creator,
            license,
            fileSizeBytes: stats.size,
        };
    }

    private toResponse(r: VideoResult) {
        return {
            id: r.id,
            title: r.title,
            creator: r.creator,
            license: r.license,
            licenseUrl: r.licenseUrl,
            provider: r.provider,
            downloadUrl: r.downloadUrl,
            thumbnailUrl: r.thumbnailUrl,
            durationSeconds: r.durationSeconds,
            resolution: r.resolution,
            fileSizeBytes: r.fileSizeBytes,
            format: r.format,
            sourcePageUrl: r.sourcePageUrl,
        };
    }
}

export const freeVideoAppService = new FreeVideoAppService();
