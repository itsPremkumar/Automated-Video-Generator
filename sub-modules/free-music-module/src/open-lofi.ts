import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { MusicTrack } from './models.js';

const CATALOG_URL = 'https://raw.githubusercontent.com/btahir/open-lofi/main/catalog.json';
const RAW_BASE = 'https://raw.githubusercontent.com/btahir/open-lofi/main/tracks';

interface LofiCatalogTrack {
    title: string;
    filename: string;
    category: string;
}

interface LofiCategory {
    slug: string;
    label: string;
    trackCount: number;
}

export class OpenLofiProvider {
    readonly name = 'open-lofi';
    private catalog: LofiCatalogTrack[] | null = null;
    private categorySlugMap: Record<string, string> = {};
    private categoryLabelMap: Record<string, string> = {};

    private async loadCatalog(): Promise<LofiCatalogTrack[]> {
        if (this.catalog) return this.catalog;

        const res = await axios.get(CATALOG_URL, { timeout: 10000 });
        const data = res.data;

        const cats: Record<string, LofiCategory> = data.categories || {};
        this.categorySlugMap = {};
        this.categoryLabelMap = {};
        for (const key of Object.keys(cats)) {
            this.categorySlugMap[cats[key].slug] = cats[key].label;
            this.categoryLabelMap[key] = cats[key].label;
        }

        this.catalog = (data.tracks || []).map((t: LofiCatalogTrack) => ({
            ...t,
            category: cats[t.category]?.slug || t.category,
        }));
        return this.catalog;
    }

    async search(query: string, count: number = 10): Promise<MusicTrack[]> {
        const tracks = await this.loadCatalog();
        const q = query.toLowerCase();

        const filtered = tracks.filter(t => {
            const catLabel = this.categorySlugMap[t.category] || '';
            return t.title.toLowerCase().includes(q) ||
                   t.category.includes(q) ||
                   catLabel.toLowerCase().includes(q);
        });

        const results = (filtered.length > 0 ? filtered : tracks).slice(0, count);

        return results.map(t => {
            const catLabel = this.categoryLabelMap[t.category] || this.categorySlugMap[t.category] || 'lo-fi';
            return {
                id: `lofi_${t.filename.replace('.mp3', '')}`,
                title: t.title,
                creator: 'Open Lo-Fi (CC0)',
                license: 'CC0 1.0 Universal (Public Domain)',
                licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
                provider: 'open-lofi',
                downloadUrl: `${RAW_BASE}/${t.category}/${t.filename}`,
                thumbnailUrl: null,
                durationSeconds: null,
                genre: catLabel.toLowerCase(),
                format: 'mp3',
                bpm: null,
                tags: ['lo-fi', 'cc0', 'public-domain', t.category],
                sourcePageUrl: 'https://github.com/btahir/open-lofi',
            };
        });
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
        const filePath = path.join(outputDir, `lofi_${sanitized}.mp3`);

        const res = await axios.get(track.downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 60000,
        });
        fs.writeFileSync(filePath, Buffer.from(res.data));

        return filePath;
    }

    async listGenres(): Promise<string[]> {
        await this.loadCatalog();
        const genres = new Set<string>();
        for (const slug of Object.keys(this.categorySlugMap)) {
            genres.add(this.categorySlugMap[slug]);
        }
        return Array.from(genres);
    }
}

export const openLofiProvider = new OpenLofiProvider();
