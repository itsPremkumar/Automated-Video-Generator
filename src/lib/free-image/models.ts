export interface ImageResult {
    id: string;
    title: string;
    creator: string;
    license: string;
    licenseUrl: string;
    provider: string;
    downloadUrl: string;
    thumbnailUrl: string | null;
    width: number | null;
    height: number | null;
    fileSizeBytes: number | null;
    sourcePageUrl: string;
}

export interface ImageSearchOptions {
    keyword: string;
    count: number;
    orientation?: 'portrait' | 'landscape' | 'square';
    minWidth?: number;
    minHeight?: number;
}

export interface ImageProvider {
    readonly name: string;
    search(options: ImageSearchOptions): Promise<ImageResult[]>;
}
