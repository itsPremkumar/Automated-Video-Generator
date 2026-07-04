import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { MusicTrack } from './models.js';

const SEARCH_URL = 'https://freemusicarchive.org/search';
const TRACK_BASE = 'https://freemusicarchive.org';

export class FmaProvider {
    readonly name = 'Free Music Archive';

    async search(query: string, count: number = 10): Promise<MusicTrack[]> {
        const res = await axios.get(SEARCH_URL, {
            params: { q: query, page: 1, per_page: Math.min(count, 50) },
            timeout: 15000,
        });

        const $ = cheerio.load(res.data);
        const tracks: MusicTrack[] = [];

        $('[data-track-info]').each((_i, el) => {
            if (tracks.length >= count) return false;
            const raw = $(el).attr('data-track-info');
            if (!raw) return;

            try {
                const info = JSON.parse(raw);
                const id = info.track_id || `fma_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                const title = info.track_title || info.title || 'Unknown';
                const artist = info.artist_name || info.artist || 'Unknown';
                const fileUrl = info.fileUrl || '';
                const genre = info.genre || info.genre_slug || query;

                tracks.push({
                    id: `fma_${id}`,
                    title,
                    creator: artist,
                    license: this.parseLicense(info),
                    licenseUrl: `https://freemusicarchive.org/license`,
                    provider: 'Free Music Archive',
                    downloadUrl: fileUrl,
                    thumbnailUrl: info.track_image_file || null,
                    durationSeconds: info.track_duration || null,
                    genre: (genre || query).toLowerCase(),
                    format: 'mp3',
                    bpm: null,
                    tags: [genre || ''],
                    sourcePageUrl: `${TRACK_BASE}${info.track_url || ''}`,
                });
            } catch {
                // skip malformed entries
            }
        });

        // If no data-track-info found (page structure changed), try alternative parsing
        if (tracks.length === 0) {
            return this.fallbackSearch(query, count);
        }

        return tracks;
    }

    private async fallbackSearch(query: string, count: number): Promise<MusicTrack[]> {
        // Fallback: scrape track page URLs and open each one
        try {
            const res = await axios.get(SEARCH_URL, {
                params: { q: query },
                timeout: 15000,
            });
            const $ = cheerio.load(res.data);
            const trackLinks: string[] = [];

            $('a[href*="/music/"]').each((_i, el) => {
                const href = $(el).attr('href');
                if (href && href.startsWith('/music/') && !href.includes('/album/') && trackLinks.length < count) {
                    trackLinks.push(href);
                }
            });

            const tracks: MusicTrack[] = [];
            for (const link of trackLinks.slice(0, count)) {
                const track = await this.scrapeTrackPage(link);
                if (track) tracks.push(track);
            }
            return tracks;
        } catch {
            return [];
        }
    }

    private async scrapeTrackPage(relativeUrl: string): Promise<MusicTrack | null> {
        try {
            const res = await axios.get(`${TRACK_BASE}${relativeUrl}`, { timeout: 10000 });
            const $ = cheerio.load(res.data);

            const title = $('title').text().replace('| Free Music Archive', '').trim() || 'Unknown';
            const downloadBtn = $('a.download-button, a[href*="files.freemusicarchive.org"]').first();
            const fileUrl = downloadBtn.attr('href') || '';
            const artist = $('.artist-name, .playlist-artist').first().text().trim() || 'Unknown';

            return {
                id: `fma_scrape_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                title,
                creator: artist,
                license: 'CC (check FMA page)',
                licenseUrl: 'https://freemusicarchive.org/license',
                provider: 'Free Music Archive',
                downloadUrl: fileUrl,
                thumbnailUrl: null,
                durationSeconds: null,
                genre: 'various',
                format: 'mp3',
                bpm: null,
                tags: [],
                sourcePageUrl: `${TRACK_BASE}${relativeUrl}`,
            };
        } catch {
            return null;
        }
    }

    private parseLicense(info: any): string {
        if (info.license_ccby || info.license === 'cc-by') return 'CC BY 4.0';
        if (info.license_public_domain || info.license === 'public-domain') return 'Public Domain';
        if (info.license === 'cc-nc') return 'CC BY-NC (non-commercial)';
        if (info.license === 'cc-sa') return 'CC BY-SA';
        return info.license || 'Various CC';
    }

    async download(track: MusicTrack, outputDir: string): Promise<string | null> {
        if (!track.downloadUrl) {
            // Try to get fileUrl from track page
            const url = await this.resolveFileUrl(track.sourcePageUrl);
            if (!url) return null;
            track.downloadUrl = url;
        }

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const sanitized = track.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60);
        const filePath = path.join(outputDir, `fma_${sanitized}.mp3`);

        const res = await axios.get(track.downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
        });
        fs.writeFileSync(filePath, Buffer.from(res.data));

        return filePath;
    }

    private async resolveFileUrl(pageUrl: string): Promise<string | null> {
        try {
            if (!pageUrl) return null;
            const res = await axios.get(pageUrl, { timeout: 10000 });
            const $ = cheerio.load(res.data);
            const btn = $('a.download-button, a[href*="files.freemusicarchive.org"]').first();
            return btn.attr('href') || null;
        } catch {
            return null;
        }
    }

    async listGenres(): Promise<string[]> {
        return [
            'ambient', 'blues', 'classical', 'country', 'electronic',
            'experimental', 'folk', 'hip-hop', 'instrumental', 'jazz',
            'pop', 'rock', 'singer-songwriter', 'soul-rnb', 'soundtrack',
        ];
    }
}

export const fmaProvider = new FmaProvider();
