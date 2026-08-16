/**
 * coverr.ts — Coverr stock video source provider.
 *
 * Free stock video clips with no watermark.
 * Identity-preserving: OFF by default, uses public API (no key required).
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../shared/logging/runtime-logging.js';

export interface CoverrVideo {
    id: string;
    url: string;
    thumbnail: string;
    title: string;
    duration: number;
    tags: string[];
    width: number;
    height: number;
}

const API_BASE = 'https://coverr.co/api/videos';
const PUBLIC_BASE = 'https://storage.coverr.co/videos';

/** Search for videos by keyword */
export async function searchVideos(
    query: string,
    limit: number = 10,
): Promise<CoverrVideo[]> {
    try {
        const res = await fetch(`${API_BASE}?search=${encodeURIComponent(query)}&per_page=${limit}`, {
            headers: { 'User-Agent': 'Automated-Video-Generator' },
        });

        if (!res.ok) {
            logWarn(`[COVERR] Search failed: ${res.status}`);
            return [];
        }

        const json = await res.json();
        return (json.data || json.videos || []).map((v: any) => ({
            id: v.id || v.video_id,
            url: v.url || `${PUBLIC_BASE}/${v.file}`,
            thumbnail: v.thumbnail || v.poster,
            title: v.title || v.name || 'Untitled',
            duration: v.duration || 0,
            tags: v.tags || [],
            height: v.height || 1080,
            width: v.width || 1920,
        }));
    } catch (e: any) {
        logWarn(`[COVERR] searchVideos error: ${e?.message ?? e}`);
        return [];
    }
}

/** Get video download URL */
export async function getDownloadUrl(videoId: string): Promise<string | null> {
    try {
        const res = await fetch(`${API_BASE}/${videoId}/download`, {
            headers: { 'User-Agent': 'Automated-Video-Generator' },
        });

        if (!res.ok) return null;
        const json = await res.json();
        return json.url || null;
    } catch {
        return null;
    }
}

/** Get popular/trending videos */
export async function getPopularVideos(limit: number = 10): Promise<CoverrVideo[]> {
    try {
        const res = await fetch(`${API_BASE}?sort=popular&per_page=${limit}`, {
            headers: { 'User-Agent': 'Automated-Video-Generator' },
        });

        if (!res.ok) return [];
        const json = await res.json();
        return (json.data || json.videos || []).map((v: any) => ({
            id: v.id || v.video_id,
            url: v.url || `${PUBLIC_BASE}/${v.file}`,
            thumbnail: v.thumbnail || v.poster,
            title: v.title || v.name || 'Untitled',
            duration: v.duration || 0,
            tags: v.tags || [],
            width: v.width || 1920,
            height: v.height || 1080,
        }));
    } catch {
        return [];
    }
}

/** Get videos by category */
export async function getVideosByCategory(category: string, limit: number = 10): Promise<CoverrVideo[]> {
    try {
        const res = await fetch(`${API_BASE}?category=${encodeURIComponent(category)}&per_page=${limit}`, {
            headers: { 'User-Agent': 'Automated-Video-Generator' },
        });

        if (!res.ok) return [];
        const json = await res.json();
        return (json.data || json.videos || []).map((v: any) => ({
            id: v.id || v.video_id,
            url: v.url || `${PUBLIC_BASE}/${v.file}`,
            thumbnail: v.thumbnail || v.poster,
            title: v.title || v.name || 'Untitled',
            duration: v.duration || 0,
            tags: v.tags || [],
            width: v.width || 1920,
            height: v.height || 1080,
        }));
    } catch {
        return [];
    }
}
