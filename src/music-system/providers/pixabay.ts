/**
 * src/music-system/providers/pixabay.ts
 * Pixabay Audio API — real produced music, free tier, API key from env.
 *
 * Endpoint: GET https://pixabay.com/api/audio/?key=KEY&q=QUERY&per_page=N
 * Docs: https://pixabay.com/api/docs/#api_audio
 *
 * Rate limit: 500 requests/hour (free tier)
 */

import axios from 'axios';
import * as fs from 'fs';
import type { MusicTrack, MusicQuery } from '../types';
import { BaseMusicProvider, withSignal } from './base';

const API_BASE = 'https://pixabay.com/api/audio/';
const PROVIDER_TIMEOUT = 10_000;

interface PixabayAudioHit {
    id: number;
    url: string;
    duration: number;
    preview_url: string;
    waveform_url: string;
    tags: string;
    title?: string;
    user: string;
    user_id: number;
    downloads: number;
}

interface PixabayAudioResponse {
    total: number;
    totalHits: number;
    hits: PixabayAudioHit[];
}

export class PixabayProvider extends BaseMusicProvider {
    readonly name = 'pixabay';
    readonly label = 'Pixabay Audio';
    readonly priority = 3; // After local/bundled, before other network providers
    readonly requiresNetwork = true;

    private apiKey: string;

    constructor(apiKey?: string) {
        super();
        this.apiKey = apiKey || process.env.PIXABAY_API_KEY || '';
    }

    async search(query: MusicQuery, _count = 5): Promise<MusicTrack[]> {
        if (!this.apiKey) {
            // Silent skip if no API key configured
            return [];
        }

        const searchTerms = [
            query.topic,
            query.preferredGenres?.[0],
            query.mood === 'any' ? '' : query.mood,
        ]
            .filter(Boolean)
            .join(' ')
            .trim() || 'ambient';

        const url = `${API_BASE}?key=${this.apiKey}&q=${encodeURIComponent(searchTerms)}&per_page=${_count}`;

        const res = await withSignal(
            (signal) => axios.get<PixabayAudioResponse>(url, {
                timeout: PROVIDER_TIMEOUT,
                signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0',
                },
            }),
            PROVIDER_TIMEOUT,
            'pixabay search',
        );

        const hits = res.data?.hits || [];
        return hits.map((hit: PixabayAudioHit) => ({
            id: `pixabay_${hit.id}`,
            title: hit.title || hit.tags?.split(',')[0]?.trim() || `Pixabay Track ${hit.id}`,
            creator: hit.user || 'Pixabay',
            license: 'Pixabay License (royalty-free)',
            licenseUrl: 'https://pixabay.com/service/terms/',
            provider: this.name,
            downloadUrl: hit.preview_url || hit.url,
            genre: 'general',
            format: 'mp3',
            tags: (hit.tags || '').split(',').map((t: string) => t.trim()),
            durationSec: hit.duration || 0,
            waveformUrl: hit.waveform_url,
        }));
    }

    async download(track: MusicTrack, destPath: string): Promise<string> {
        this.ensureDir(destPath);

        const res = await withSignal(
            (signal) => axios.get(track.downloadUrl, {
                responseType: 'arraybuffer',
                timeout: PROVIDER_TIMEOUT,
                signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0',
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
