/**
 * src/music-system/providers/ccmixter.ts
 * ccMixter API — free CC-licensed music. No API key required.
 *
 * API endpoint: GET https://ccmixter.org/api/query?limit=N&tags=TAG&f=json
 * Download URL: https://ccmixter.org/content/{USER}/{FILENAME}
 *
 * NOTE: Pixabay was considered but their API only supports images & videos
 * (https://pixabay.com/api/docs/) — no audio endpoint. ccMixter is the
 * reliable, free, no-key alternative for real music.
 */

import axios from 'axios';
import * as fs from 'fs';
import type { MusicTrack, MusicQuery } from '../types';
import { BaseMusicProvider, withSignal } from './base';

const API_BASE = 'https://ccmixter.org/api/query';
const PROVIDER_TIMEOUT = 15_000;

interface CcMixterTrack {
    upload_id: number;
    upload_name: string;
    user_name: string;
    license_url: string;
    license_name?: string;
    upload_tags: string;
    artist_page_url?: string;
    files: Array<{
        download_url: string;
        file_format_info?: {
            'media-type'?: string;
            ps?: string; // duration like "5:52"
        };
        file_filesize?: string;
    }>;
}

interface CcMixterResponse extends Array<CcMixterTrack> {}

export class CcMixterProvider extends BaseMusicProvider {
    readonly name = 'ccmixter';
    readonly label = 'ccMixter (CC Music)';
    readonly priority = 4; // After bundled/local, before other network providers
    readonly requiresNetwork = true;

    /** Parse duration string like "5:52" to seconds */
    private parseDuration(ps: string | undefined): number {
        if (!ps) return 0;
        const parts = ps.split(':').map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return 0;
    }

    /** Map our mood/genre to ccMixter tags.
     *
     * ccMixter uses AND semantics for comma-separated tags —
     * too many tags returns empty results. Limit to 2-3 broad tags.
     */
    private moodToTags(query: MusicQuery): string {
        // Broad moods — 1-2 tags only
        const broadTag = (() => {
            switch (query.mood) {
                case 'upbeat':       return 'dance';
                case 'dramatic':     return 'cinematic';
                case 'professional': return 'ambient';
                case 'nostalgic':    return 'jazz,lofi';
                case 'dark':         return 'ambient,dark';
                case 'calm':
                default:             return 'ambient';
            }
        })();

        // Get the broad tags
        const tags = broadTag.split(',');

        // Add one topic keyword (if available and different)
        if (query.topic) {
            const topicWord = query.topic
                .toLowerCase()
                .split(/\s+/)
                .find(w => w.length > 3 && !tags.includes(w));
            if (topicWord && tags.length < 3) tags.push(topicWord);
        }

        return tags.join(',');
    }

    async search(query: MusicQuery, count = 5): Promise<MusicTrack[]> {
        const tags = this.moodToTags(query);
        const url = `${API_BASE}?limit=${count}&tags=${encodeURIComponent(tags)}&f=json`;

        const res = await withSignal(
            (signal) => axios.get<CcMixterResponse>(url, {
                timeout: PROVIDER_TIMEOUT,
                signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0',
                },
            }),
            PROVIDER_TIMEOUT,
            'ccmixter search',
        );

        const tracks = res.data || [];
        return tracks.map((t: CcMixterTrack) => {
            const mainFile = t.files?.[0];
            const durStr = mainFile?.file_format_info?.ps;
            const durationSec = this.parseDuration(durStr);

            return {
                id: `ccmixter_${t.upload_id}`,
                title: t.upload_name || `Track ${t.upload_id}`,
                creator: t.user_name || 'ccMixter',
                license: t.license_name || 'CC (see url)',
                licenseUrl: t.license_url || 'https://ccmixter.org',
                provider: this.name,
                downloadUrl: mainFile?.download_url || '',
                genre: 'general',
                format: 'mp3',
                tags: (t.upload_tags || '').split(',').map((s: string) => s.trim()).filter(Boolean),
                durationSec,
            } as MusicTrack;
        });
    }

    async download(track: MusicTrack, destPath: string): Promise<string> {
        if (!track.downloadUrl) {
            throw new Error(`No download URL for track: ${track.title}`);
        }

        this.ensureDir(destPath);

        const res = await withSignal(
            (signal) => axios.get(track.downloadUrl, {
                responseType: 'arraybuffer',
                timeout: PROVIDER_TIMEOUT,
                signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0',
                    'Referer': 'https://ccmixter.org/',
                    'Accept': 'audio/mpeg,*/*',
                },
            }),
            PROVIDER_TIMEOUT,
            `download ${track.title}`,
        );

        const buf = Buffer.from(res.data as ArrayBuffer);
        if (!buf || buf.length < 1024) {
            throw new Error(`Downloaded file too small for ${track.title}`);
        }
        fs.writeFileSync(destPath, buf);
        return destPath;
    }
}
