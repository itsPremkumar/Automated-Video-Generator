/**
 * upload-post.ts — Cross-platform video posting service.
 *
 * Supports direct upload to TikTok, Instagram, YouTube Shorts.
 * Uses official APIs where possible, with fallback to upload-post.com API.
 *
 * Identity-preserving: all posting is OPT-IN via env config.
 * Never throws — returns result object with success/failure.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn, logError } from '../../shared/logging/runtime-logging.js';

export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'youtube_shorts';

export interface UploadPostConfig {
    apiKey: string;
    username: string;
    enabled: boolean;
    platforms: Platform[];
    autoUpload: boolean;
    youtubePrivacyStatus: 'public' | 'unlisted' | 'private';
}

export interface UploadResult {
    success: boolean;
    platform: Platform;
    url?: string;
    error?: string;
}

export interface BatchUploadResult {
    success: boolean;
    results: UploadResult[];
    failed: number;
    passed: number;
}

const UPLOAD_POST_API = 'https://api.upload-post.com/api';

/** Get config from environment */
export function getUploadPostConfig(): UploadPostConfig {
    return {
        apiKey: process.env.UPLOAD_POST_API_KEY || '',
        username: process.env.UPLOAD_POST_USERNAME || '',
        enabled: process.env.UPLOAD_POST_ENABLED === 'true',
        platforms: (process.env.UPLOAD_POST_PLATFORMS || 'tiktok,instagram').split(',') as Platform[],
        autoUpload: process.env.UPLOAD_POST_AUTO_UPLOAD === 'true',
        youtubePrivacyStatus: (process.env.UPLOAD_POST_YOUTUBE_PRIVACY as any) || 'public',
    };
}

/** Check if upload service is configured */
export function isUploadConfigured(): boolean {
    const cfg = getUploadPostConfig();
    return cfg.enabled && !!cfg.apiKey && !!cfg.username;
}

/** Upload video to a single platform */
export async function uploadToPlatform(
    videoPath: string,
    title: string,
    platform: Platform,
    description?: string,
    tags?: string[],
): Promise<UploadResult> {
    const cfg = getUploadPostConfig();

    if (!cfg.enabled) {
        return { success: false, platform, error: 'Upload posting is disabled' };
    }
    if (!cfg.apiKey || !cfg.username) {
        return { success: false, platform, error: 'Upload posting not configured' };
    }
    if (!fs.existsSync(videoPath)) {
        return { success: false, platform, error: `Video not found: ${videoPath}` };
    }

    logInfo(`[UPLOAD] Posting to ${platform}: ${title}`);

    try {
        // Use upload-post.com API for cross-platform posting
        const formData = new FormData();
        const videoBuffer = fs.readFileSync(videoPath);
        const blob = new Blob([videoBuffer], { type: 'video/mp4' });
        formData.append('video', blob, path.basename(videoPath));
        formData.append('user', cfg.username);
        formData.append('title', title.slice(0, 2200));
        formData.append('privacy_level', 'PUBLIC_TO_EVERYONE');
        formData.append('platform[]', platform);

        if (description && platform.startsWith('youtube')) {
            formData.append('youtube_description', description.slice(0, 5000));
            for (const tag of (tags || []).slice(0, 30)) {
                formData.append('tags[]', tag);
            }
            formData.append('privacyStatus', cfg.youtubePrivacyStatus);
            formData.append('containsSyntheticMedia', 'true');
        }

        const res = await fetch(`${UPLOAD_POST_API}/upload`, {
            method: 'POST',
            headers: { Authorization: `Apikey ${cfg.apiKey}` },
            body: formData,
        });

        if (!res.ok) {
            const text = await res.text();
            logWarn(`[UPLOAD] ${platform} failed: ${res.status} ${text.slice(0, 200)}`);
            return { success: false, platform, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
        }

        const json = await res.json();
        const url = json?.url || json?.data?.url || json?.data?.short_url;
        logInfo(`[UPLOAD] ${platform} success: ${url || 'no URL returned'}`);
        return { success: true, platform, url };
    } catch (e: any) {
        logWarn(`[UPLOAD] ${platform} error: ${e?.message ?? e}`);
        return { success: false, platform, error: e?.message ?? String(e) };
    }
}

/** Upload video to all configured platforms */
export async function uploadToAllPlatforms(
    videoPath: string,
    title: string,
    description?: string,
    tags?: string[],
): Promise<BatchUploadResult> {
    const cfg = getUploadPostConfig();
    const platforms = cfg.platforms;
    const results: UploadResult[] = [];

    for (const platform of platforms) {
        const result = await uploadToPlatform(videoPath, title, platform, description, tags);
        results.push(result);
    }

    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
        success: failed === 0,
        results,
        passed,
        failed,
    };
}

/** Get list of supported platforms */
export function getSupportedPlatforms(): Platform[] {
    return ['tiktok', 'instagram', 'youtube', 'youtube_shorts'];
}

/** Validate platform name */
export function isValidPlatform(platform: string): platform is Platform {
    return getSupportedPlatforms().includes(platform as Platform);
}
