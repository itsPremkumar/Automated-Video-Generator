/**
 * YouTube resumable upload via the Data API v3.
 *
 * `live` mode dynamically imports googleapis (kept lazy so dry-run / sandbox
 * modes need zero external dependencies and work fully offline). `dry-run` /
 * `sandbox` modes validate inputs, build the request shape, and return a
 * mocked result — no network, no credentials required.
 */
import * as fs from 'fs';
import type { UploadMetadata, UploadMode, UploadResult, YouTubeTokens } from './types.js';

const DEFAULT_CATEGORY = '22'; // People & Blogs

export interface UploadInput {
    videoPath: string;
    metadata: UploadMetadata;
    tokens: YouTubeTokens;
    mode: UploadMode;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
}

function assertFile(path: string): void {
    if (!fs.existsSync(path)) {
        throw new Error(`Video file not found: ${path}`);
    }
    const stat = fs.statSync(path);
    if (stat.size === 0) {
        throw new Error(`Video file is empty: ${path}`);
    }
}

function normalizeMeta(meta: UploadMetadata) {
    return {
        snippet: {
            title: meta.title,
            description: meta.description ?? '',
            tags: meta.tags ?? [],
            categoryId: meta.categoryId ?? DEFAULT_CATEGORY,
        },
        status: {
            privacyStatus: meta.privacyStatus,
        },
    };
}

export async function uploadVideo(input: UploadInput): Promise<UploadResult> {
    assertFile(input.videoPath);

    if (input.mode === 'dry-run' || input.mode === 'sandbox') {
        const meta = normalizeMeta(input.metadata);
        const fakeId = `dryrun_${Date.now().toString(36)}`;
        return {
            videoId: fakeId,
            url: `https://www.youtube.com/watch?v=${fakeId}`,
            dryRun: true,
        };
        // `meta` is intentionally computed to validate shape before the mock.
    }

    // Live mode
    const { google } = await import('googleapis');
    const oauth2 = new google.auth.OAuth2(input.clientId, input.clientSecret, input.redirectUri);
    oauth2.setCredentials({
        access_token: input.tokens.accessToken,
        refresh_token: input.tokens.refreshToken,
        expiry_date: input.tokens.expiryDate,
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2 });
    const meta = normalizeMeta(input.metadata);

    const res = await youtube.videos.insert(
        {
            part: ['snippet', 'status'],
            requestBody: meta,
            media: {
                body: fs.createReadStream(input.videoPath),
            },
        },
        { onUploadProgress: () => undefined }
    );

    const videoId = res.data.id ?? '';
    return {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        dryRun: false,
    };
}
