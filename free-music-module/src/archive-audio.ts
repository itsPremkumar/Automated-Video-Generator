import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { MusicTrack } from './models.js';

const SEARCH_URL = 'https://archive.org/advancedsearch.php';
const DOWNLOAD_TIMEOUT = 120000;

export class ArchiveAudioProvider {
    readonly name = 'Internet Archive';

    async search(query: string, count: number = 5): Promise<MusicTrack[]> {
        const quoted = query.includes(' ') ? `"${query}"` : query;
        const params = {
            q: `(${quoted}) AND mediatype:audio AND (format:MP3 OR format:"VBR MP3" OR format:"OGG VORBIS")`,
            fl: 'identifier,title,creator,downloads,avg_rating,description,date,publicdate',
            sort: 'downloads desc',
            rows: Math.min(count * 3, 50),
            page: 1,
            output: 'json',
        };

        const res = await axios.get(SEARCH_URL, { params, timeout: 15000 });
        const docs: any[] = res.data?.response?.docs || [];

        const results: MusicTrack[] = [];
        for (const d of docs) {
            if (results.length >= count) break;
            const id = d.identifier;
            const mp3Url = await this.findAudioUrl(id);
            if (!mp3Url) continue;

            results.push({
                id,
                title: d.title || id,
                creator: d.creator || 'Unknown',
                license: 'Public Domain (check archive.org for details)',
                licenseUrl: `https://archive.org/details/${id}`,
                provider: 'Internet Archive',
                downloadUrl: mp3Url,
                thumbnailUrl: `https://archive.org/services/img/${id}`,
                durationSeconds: null,
                genre: query,
                format: 'mp3',
                bpm: null,
                tags: [],
                sourcePageUrl: `https://archive.org/details/${id}`,
            });
        }

        return results;
    }

    private async findAudioUrl(identifier: string): Promise<string | null> {
        try {
            const res = await axios.get(
                `https://archive.org/metadata/${identifier}`,
                { timeout: 10000 },
            );
            const files: any[] = res.data?.files || [];
            const audioFile = files.find((f: any) =>
                f.name && f.name.endsWith('.mp3') &&
                (f.format === 'MP3' || f.format === 'VBR MP3' || f.format?.includes('MP3')) &&
                !f.name.includes('_thumb') &&
                !f.name.includes('__')
            );
            if (audioFile) {
                return `https://archive.org/download/${identifier}/${audioFile.name}`;
            }
            return null;
        } catch {
            return null;
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
        const ext = path.extname(track.downloadUrl) || '.mp3';
        const filePath = path.join(outputDir, `archive_${sanitized}${ext}`);

        const res = await axios.get(track.downloadUrl, {
            responseType: 'arraybuffer',
            timeout: DOWNLOAD_TIMEOUT,
        });
        fs.writeFileSync(filePath, Buffer.from(res.data));

        return filePath;
    }

    async listGenres(): Promise<string[]> {
        return [
            'music', 'ambient', 'classical', 'jazz', 'folk',
            'blues', 'electronic', 'rock', 'pop', 'spoken word',
            'radio', 'podcast', 'lecture', 'educational',
        ];
    }
}

export const archiveAudioProvider = new ArchiveAudioProvider();
