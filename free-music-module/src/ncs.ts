import * as ncsApi from 'nocopyrightsounds-api';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { MusicTrack } from './models.js';

export class NcsProvider {
    readonly name = 'NCS (NoCopyrightSounds)';

    async search(query: string, count: number = 10): Promise<MusicTrack[]> {
        try {
            // search() seems to not work reliably, use getSongs + client-side filter
            const allSongs = await ncsApi.getSongs();
            const q = query.toLowerCase();

            const filtered = (allSongs || []).filter((s: any) =>
                !query || query === '*' ||
                (s.name || '').toLowerCase().includes(q) ||
                (s.genre?.name || s.genre || '').toLowerCase().includes(q) ||
                (s.artists || []).some((a: any) => (a.name || '').toLowerCase().includes(q))
            );

            const results = filtered.slice(0, count);

            return results.map((s: any) => {
                const downloadUrl = s.download?.regular || s.download?.instrumental || s.previewUrl || '';
                const artists = (s.artists || []).map((a: any) => a.name || a).join(', ') || 'NCS';
                return {
                    id: `ncs_${s.id || s.name?.replace(/\s+/g, '-') || Date.now()}`,
                    title: s.name || 'Unknown Track',
                    creator: artists,
                    license: 'Free for monetized content (NoCopyrightSounds)',
                    licenseUrl: 'https://ncs.io/',
                    provider: 'NCS',
                    downloadUrl,
                    thumbnailUrl: s.coverUrl || s.image?.url || null,
                    durationSeconds: s.duration || null,
                    genre: (s.genre?.name || s.genre || query || 'electronic').toLowerCase(),
                    format: 'mp3',
                    bpm: s.bpm || null,
                    tags: [s.genre?.name || 'electronic', ...(s.tags || [])].filter(Boolean),
                    sourcePageUrl: s.url || `https://ncs.io/music?q=${encodeURIComponent(s.name || query)}`,
                };
            });
        } catch (err: any) {
            console.warn(`[NCS] Error: ${err.message}`);
            return [];
        }
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
        const filePath = path.join(outputDir, `ncs_${sanitized}.mp3`);

        let url = track.downloadUrl;
        // If it's a download page URL (not direct MP3), try to resolve
        if (url.includes('/track/download/')) {
            url = await this.resolveDirectUrl(url);
        }

        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 120000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        fs.writeFileSync(filePath, Buffer.from(res.data));

        return filePath;
    }

    private async resolveDirectUrl(downloadPage: string): Promise<string> {
        try {
            const res = await axios.get(downloadPage, {
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' },
                maxRedirects: 5,
            });
            // Follow redirects to get direct MP3 URL
            return res.request?.res?.responseUrl || downloadPage;
        } catch {
            return downloadPage;
        }
    }

    async listGenres(): Promise<string[]> {
        try {
            const genres = ncsApi.Genre ? Object.keys(ncsApi.Genre) : [];
            if (genres.length > 0) return genres;
        } catch {}
        return ['electronic', 'house', 'dubstep', 'trap', 'pop', 'rock', 'drum & bass', 'future bass'];
    }
}

export const ncsProvider = new NcsProvider();
