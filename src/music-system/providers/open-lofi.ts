/**
 * src/music-system/providers/open-lofi.ts
 * Open Lo-Fi CC0 catalog from GitHub.
 * Source: https://github.com/btahir/open-lofi
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import type { MusicTrack, MusicQuery } from '../types';
import { BaseMusicProvider, withSignal } from './base';
import { globalEventBus } from '../events';

const CATALOG_URL = 'https://raw.githubusercontent.com/btahir/open-lofi/main/catalog.json';
const RAW_BASE = 'https://raw.githubusercontent.com/btahir/open-lofi/main/tracks';
const PROVIDER_TIMEOUT = 10_000;

export class OpenLofiProvider extends BaseMusicProvider {
    readonly name = 'open-lofi';
    readonly label = 'Open Lo-Fi (CC0)';
    readonly priority = 5;
    readonly requiresNetwork = true;

    private catalog: any[] | null = null;
    private categoryLabel: Record<string, string> = {};

    private async loadCatalog(): Promise<any[]> {
        if (this.catalog) return this.catalog;

        const res = await withSignal(
            (signal) => axios.get(CATALOG_URL, { timeout: PROVIDER_TIMEOUT, signal }),
            PROVIDER_TIMEOUT,
            'open-lofi catalog',
        );
        const data = res.data as any;
        const cats: Record<string, any> = data.categories || {};
        this.categoryLabel = {};
        for (const key of Object.keys(cats)) {
            this.categoryLabel[cats[key].slug] = cats[key].label;
        }
        const loaded = (data.tracks || []).map((t: any) => ({
            ...t,
            category: cats[t.category]?.slug || t.category,
        }));
        this.catalog = loaded;
        return loaded;
    }

    async search(query: MusicQuery, _count = 5): Promise<MusicTrack[]> {
        const tracks = await this.loadCatalog();
        const q = (query.topic || query.voiceoverText || query.preferredGenres?.join(' ') || '').toLowerCase();

        const filtered = tracks.filter((t: any) => {
            const label = this.categoryLabel[t.category] || '';
            return (
                t.title.toLowerCase().includes(q) ||
                t.category.includes(q) ||
                label.toLowerCase().includes(q)
            );
        });

        const results = (filtered.length > 0 ? filtered : tracks).slice(0, 5);

        return results.map((t: any) => {
            const catLabel = this.categoryLabel[t.category] || 'lo-fi';
            return {
                id: `lofi_${t.filename.replace(/\.mp3$/i, '')}`,
                title: t.title,
                creator: 'Open Lo-Fi (CC0)',
                license: 'CC0 1.0 Universal (Public Domain)',
                licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
                provider: this.name,
                downloadUrl: `${RAW_BASE}/${t.category}/${t.filename}`,
                genre: catLabel.toLowerCase(),
                format: 'mp3',
                tags: ['lo-fi', 'cc0', 'public-domain', t.category],
                durationSec: t.duration || 0,
            } as MusicTrack;
        });
    }

    async download(track: MusicTrack, destPath: string): Promise<string> {
        this.ensureDir(destPath);

        const res = await withSignal(
            (signal) => axios.get(track.downloadUrl, {
                responseType: 'arraybuffer',
                timeout: PROVIDER_TIMEOUT,
                signal,
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
