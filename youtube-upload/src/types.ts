/**
 * Types shared across the YouTube upload adapter.
 */
export interface YouTubeCredentials {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export interface YouTubeTokens {
    accessToken: string;
    refreshToken?: string;
    scope: string;
    tokenType: string;
    expiryDate?: number;
}

export interface UploadMetadata {
    title: string;
    description?: string;
    tags?: string[];
    categoryId?: string;
    privacyStatus: 'public' | 'private' | 'unlisted';
    thumbnailPath?: string;
}

export interface UploadResult {
    videoId: string;
    url: string;
    dryRun: boolean;
}

export type UploadMode = 'dry-run' | 'sandbox' | 'live';
