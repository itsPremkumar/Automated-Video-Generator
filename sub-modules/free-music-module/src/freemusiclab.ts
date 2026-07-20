import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { MusicTrack } from './models.js';

const API_BASE = 'https://api.freemusiclab.ai/api/v1';
const DOWNLOAD_TIMEOUT = 60000;

export class FreeMusicLabProvider {
    readonly name = 'FreeMusicLab';

    private get apiKey(): string | null {
        return process.env.FREEMUSICLAB_API_KEY || null;
    }

    private get headers(): Record<string, string> {
        const key = this.apiKey;
        if (!key) return {};
        return { Authorization: `Bearer ${key}` };
    }

    get isConfigured(): boolean {
        return this.apiKey !== null;
    }

    async search(query: string, count: number = 10): Promise<MusicTrack[]> {
        if (!this.isConfigured) {
            console.warn('[FREE-MUSIC] FREEMUSICLAB_API_KEY not set. Get a free key at https://freemusiclab.ai/profile');
            return [];
        }

        const params: any = { limit: Math.min(count, 50) };
        if (query && query !== '*') {
            params.genre = query;
        }

        const res = await axios.get(`${API_BASE}/tracks`, {
            headers: this.headers,
            params,
            timeout: 15000,
        });

        const tracks: any[] = res.data?.tracks || res.data?.data || [];
        return tracks.slice(0, count).map((t: any) => ({
            id: t.id,
            title: t.title,
            creator: t.creator || 'FreeMusicLab',
            license: t.license || 'Free for commercial use (Google Lyria)',
            licenseUrl: 'https://freemusiclab.ai/license',
            provider: 'FreeMusicLab',
            downloadUrl: t.downloadUrl,
            thumbnailUrl: t.waveformUrl || null,
            durationSeconds: t.duration || null,
            genre: t.genre || query || 'unknown',
            format: 'mp3',
            bpm: null,
            tags: t.mood || [],
            sourcePageUrl: `https://freemusiclab.ai/browse?id=${t.id}`,
        }));
    }

    async download(track: MusicTrack, outputDir: string): Promise<string | null> {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const sanitized = track.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60);
        const filePath = path.join(outputDir, `fml_${sanitized}.mp3`);

        const res = await axios.get(track.downloadUrl, {
            responseType: 'arraybuffer',
            timeout: DOWNLOAD_TIMEOUT,
            headers: this.headers,
        });
        fs.writeFileSync(filePath, Buffer.from(res.data));

        return filePath;
    }

    async listGenres(): Promise<string[]> {
        return [
            'lofi', 'ambient', 'cinematic', 'electronic', 'hiphop',
            'jazz', 'classical', 'pop', 'rock', 'folk',
            'downtempo', 'chill', 'drone', 'synthwave', 'world',
        ];
    }
}

export const freeMusicLabProvider = new FreeMusicLabProvider();
