import * as eif from '@ichbinsoftware/everything-is-free';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { MusicTrack } from './models.js';

interface StemInfo {
    name: string;
    description: string;
    streamUrl: string;
    wavUrl: string;
}

interface TrackInfo {
    title: string;
    number: number;
    bpm: number;
    key: string;
    streamUrl: string;
    wavUrl: string;
    stemsUrl: string;
    stems: StemInfo[];
    lyrics: string;
}

export class EverythingIsFreeProvider {
    readonly name = 'everythingisfree';

    private get tracks(): TrackInfo[] {
        const data = (eif as any).default;
        return data?.tracks || [];
    }

    async search(query: string, count: number = 10): Promise<MusicTrack[]> {
        const allTracks = this.tracks;
        const q = query.toLowerCase();

        const filtered = allTracks.filter(t =>
            (t.title || '').toLowerCase().includes(q) ||
            (t.key || '').toLowerCase().includes(q)
        );

        const results = (filtered.length > 0 ? filtered : allTracks).slice(0, count);

        return results.map(t => {
            const downloadUrl = t.wavUrl || t.streamUrl || '';

            return {
                id: `eif_track_${t.number || '0'}`,
                title: t.title || 'Unknown Track',
                creator: 'Software-Entwicklungskit',
                license: 'CC0 1.0 Universal (Public Domain)',
                licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
                provider: 'everythingisfree',
                downloadUrl,
                thumbnailUrl: null,
                durationSeconds: null,
                genre: 'electronic',
                format: t.wavUrl ? 'wav' : 'm4a',
                bpm: t.bpm || null,
                tags: ['cc0', 'public-domain', t.key || ''].filter(Boolean),
                sourcePageUrl: t.webUrl || 'https://ev3.ichbinsoftware.com',
            };
        });
    }

    async download(track: MusicTrack, outputDir: string): Promise<string | null> {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const ext = path.extname(track.downloadUrl) || '.wav';
        const sanitized = track.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60);
        const filePath = path.join(outputDir, `eif_${sanitized}${ext}`);

        const res = await axios.get(track.downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
        });
        fs.writeFileSync(filePath, Buffer.from(res.data));

        return filePath;
    }

    async listGenres(): Promise<string[]> {
        return ['electronic', 'experimental'];
    }

    get trackCount(): number {
        return this.tracks.length;
    }
}

export const everythingIsFreeProvider = new EverythingIsFreeProvider();
