import { AppConfig } from './config';
import { WikimediaProvider } from './providers/wikimedia';
import { ArchiveOrgProvider } from './providers/archive';
import { DownloadManager } from './download/downloader';
import { writeMetadataJson, writeAttributionFile, appendHistory } from './download/metadata';
import { DownloadResult, SearchFilters, VideoProvider, VideoResult } from './models/video';
import { logger } from './utils/logger';

export * from './models/video';
export * from './config';

/** Which provider(s) to query for a search. */
export type SourceSelection = 'wikimedia' | 'archive' | 'all';

/** Builds the list of provider instances to query, based on user selection. */
export function buildProviders(config: AppConfig, selection: SourceSelection): VideoProvider[] {
  const wikimedia = new WikimediaProvider(config);
  const archive = new ArchiveOrgProvider(config);

  switch (selection) {
    case 'wikimedia':
      return [wikimedia];
    case 'archive':
      return [archive];
    case 'all':
    default:
      return [wikimedia, archive];
  }
}

/**
 * Runs a search across the requested providers, merging and trimming
 * results to the requested count. Provider failures are logged and
 * skipped rather than aborting the whole search.
 */
export async function searchVideos(
  config: AppConfig,
  providers: VideoProvider[],
  filters: SearchFilters,
): Promise<VideoResult[]> {
  const perProviderCount = providers.length > 1 ? Math.ceil(filters.count / providers.length) + 2 : filters.count;

  const settled = await Promise.allSettled(
    providers.map((provider) => provider.search({ ...filters, count: perProviderCount })),
  );

  const merged: VideoResult[] = [];
  settled.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      merged.push(...result.value);
    } else {
      const providerName = providers[idx].name;
      logger.warn(`${providerName} search failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
  });

  return merged.slice(0, filters.count);
}

/** Downloads a set of videos and writes metadata/attribution/history alongside them. */
export async function downloadVideos(
  config: AppConfig,
  videos: VideoResult[],
): Promise<DownloadResult[]> {
  const manager = new DownloadManager(config);
  const results = await manager.downloadAll(videos);

  await writeMetadataJson(config, results);
  await writeAttributionFile(config, results);
  await appendHistory(config, results);

  return results;
}