import { WikimediaProvider } from './providers/wikimedia.js';
import { ArchiveOrgProvider } from './providers/archive.js';
import { FreeVideoAdapter } from './adapter.js';
import { FreeDownloadManager } from './download/downloader.js';
import { VideoResult, SearchFilters, DownloadResult, DownloadProgress, VideoFormat, VideoProvider } from './models.js';

export const wikiProvider = new WikimediaProvider();
export const archiveProvider = new ArchiveOrgProvider();
export const freeVideoDownloader = new FreeDownloadManager();
export const freeVideoAdapter = new FreeVideoAdapter();

export type { VideoResult, SearchFilters, DownloadResult, DownloadProgress, VideoFormat, VideoProvider };
