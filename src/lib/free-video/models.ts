export type VideoFormat = 'mp4' | 'webm' | 'ogg' | 'unknown';

export interface SearchFilters {
    keyword: string;
    count: number;
    license?: string;
    minDurationSeconds?: number;
    maxDurationSeconds?: number;
    minResolutionHeight?: number;
    maxFileSizeBytes?: number;
    hdOnly?: boolean;
    sortBy?: 'relevance' | 'newest' | 'resolution';
    page?: number;
}

export interface VideoResult {
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
    format: VideoFormat;
    sourcePageUrl: string;
}

export interface VideoProvider {
    readonly name: string;
    search(filters: SearchFilters): Promise<VideoResult[]>;
}

export interface DownloadResult {
    video: VideoResult;
    success: boolean;
    localPath: string | null;
    error: string | null;
    bytesDownloaded: number;
    resumed: boolean;
}

export interface DownloadProgress {
    percent: number;
    speed: string;
    eta: string;
    totalSize: string;
}
