/**
 * Free, fully-offine-capable background music resolver.
 *
 * Picks a royalty-free / public-domain track automatically when the user does
 * not supply one, so a "no-setup" generation still gets background music.
 *
 * Providers (all free, no API key required):
 *  - open-lofi         → CC0 public-domain lo-fi (GitHub-hosted catalog)
 *  - internet-archive  → Public Domain / CC audio from archive.org
 *  - local             → user-dropped tracks already in input/music/
 *
 * Designed to be additive and non-breaking: returns null on any failure so the
 * caller simply proceeds without music.
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { logInfo, logWarn, resolveProjectPath } from '../runtime';

const console = {
    log: (...args: unknown[]) => logInfo('[FREE-MUSIC]', ...args),
    warn: (...args: unknown[]) => logWarn('[FREE-MUSIC]', ...args),
};

export interface FreeMusicTrack {
    id: string;
    title: string;
    creator: string;
    license: string;
    licenseUrl: string;
    provider: string;
    downloadUrl: string;
    genre: string;
    format: string;
    tags: string[];
}

export interface FreeMusicProvider {
    readonly name: string;
    search(query: string, count?: number): Promise<FreeMusicTrack[]>;
}

const AUDIO_EXT = new Set(['mp3', 'ogg', 'wav', 'm4a', 'flac', 'aac']);

function sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

// ─── Open Lofi (CC0) ───────────────────────────────────────────────────────
class OpenLofiProvider implements FreeMusicProvider {
    readonly name = 'open-lofi';
    private catalog: any[] | null = null;
    private categoryLabel: Record<string, string> = {};

    private async loadCatalog(): Promise<any[]> {
        if (this.catalog) return this.catalog;
        const CATALOG_URL = 'https://raw.githubusercontent.com/btahir/open-lofi/main/catalog.json';
        const res = await axios.get(CATALOG_URL, { timeout: 10000 });
        const data = res.data as any;
        const cats: Record<string, any> = data.categories || {};
        this.categoryLabel = {};
        for (const key of Object.keys(cats)) this.categoryLabel[cats[key].slug] = cats[key].label;
        const loaded = (data.tracks || []).map((t: any) => ({
            ...t,
            category: cats[t.category]?.slug || t.category,
        }));
        this.catalog = loaded;
        return loaded;
    }

    async search(query: string, count = 5): Promise<FreeMusicTrack[]> {
        const tracks = await this.loadCatalog();
        const q = query.toLowerCase();
        const filtered = tracks.filter((t: any) => {
            const label = this.categoryLabel[t.category] || '';
            return t.title.toLowerCase().includes(q) || t.category.includes(q) || label.toLowerCase().includes(q);
        });
        const results = (filtered.length > 0 ? filtered : tracks).slice(0, count);
        const RAW_BASE = 'https://raw.githubusercontent.com/btahir/open-lofi/main/tracks';
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
            };
        });
    }
}

// ─── Internet Archive (Public Domain / CC) ─────────────────────────────────
class InternetArchiveProvider implements FreeMusicProvider {
    readonly name = 'internet-archive';

    async search(query: string, count = 5): Promise<FreeMusicTrack[]> {
        const q = encodeURIComponent(`(${query}) AND mediatype:audio AND (licenseurl:*)`).replace(/ /g, '+');
        const searchUrl = `https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=${count}&output=json`;
        const res = await axios.get(searchUrl, { timeout: 10000 });
        const docs = (res.data as any)?.response?.docs || [];
        return docs.map((d: any) => {
            const identifier = d.identifier as string;
            return {
                id: `ia_${identifier}`,
                title: (d.title as string) || identifier,
                creator: (d.creator as string) || 'Internet Archive',
                license: (d.licenseurl as string) || 'Public Domain / CC',
                licenseUrl: (d.licenseurl as string) || 'https://archive.org',
                provider: this.name,
                downloadUrl: `https://archive.org/download/${identifier}/${identifier}.mp3`,
                genre: 'archive',
                format: 'mp3',
                tags: ['archive.org', 'public-domain', query],
            } as FreeMusicTrack;
        });
    }
}

// ─── Local user tracks (offline, no network) ─────────────────────────────────
class LocalFreeProvider implements FreeMusicProvider {
    readonly name = 'local';

    async search(_query: string, count = 5): Promise<FreeMusicTrack[]> {
        const musicDir = resolveProjectPath('input', 'music');
        if (!fs.existsSync(musicDir)) return [];
        const out: FreeMusicTrack[] = [];
        for (const entry of fs.readdirSync(musicDir, { withFileTypes: true })) {
            if (entry.isDirectory()) continue;
            const ext = entry.name.split('.').pop()?.toLowerCase() || '';
            if (!AUDIO_EXT.has(ext)) continue;
            if (entry.name.startsWith('__auto__')) continue;
            out.push({
                id: `local_${entry.name}`,
                title: entry.name.replace(/\.[^.]+$/, ''),
                creator: 'Local asset',
                license: 'User-provided (assumed royalty-free)',
                licenseUrl: '',
                provider: this.name,
                downloadUrl: '',
                genre: 'local',
                format: ext,
                tags: ['local', 'user'],
            });
            if (out.length >= count) break;
        }
        return out;
    }

    resolveLocalPath(track: FreeMusicTrack): string | null {
        const musicDir = resolveProjectPath('input', 'music');
        const fileName = track.id.replace(/^local_/, '');
        const full = path.join(musicDir, fileName);
        return fs.existsSync(full) ? full : null;
    }
}

const localProvider = new LocalFreeProvider();

function defaultProviders(): FreeMusicProvider[] {
    return [new OpenLofiProvider(), new InternetArchiveProvider(), localProvider];
}

export function listFreeMusicProviders(): string[] {
    return defaultProviders().map((p) => p.name);
}

async function downloadTrack(track: FreeMusicTrack, destPath: string): Promise<void> {
    if (track.provider === 'local') {
        const local = localProvider.resolveLocalPath(track);
        if (!local) throw new Error(`Local track not found: ${track.id}`);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(local, destPath);
        return;
    }
    const res = await axios.get(track.downloadUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(res.data as ArrayBuffer);
    if (!buf || buf.length < 1024) throw new Error(`Downloaded file too small for ${track.title}`);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buf);
}

export interface ResolveFreeMusicOptions {
    query?: string;
    cacheDir?: string;
    preferProviders?: string[];
    enabled?: boolean;
}

export interface ResolvedFreeMusic {
    localPath: string;
    track: FreeMusicTrack;
}

export async function resolveFreeBackgroundMusic(opts: ResolveFreeMusicOptions = {}): Promise<ResolvedFreeMusic | null> {
    const enabled = opts.enabled ?? (process.env.AUTO_FREE_MUSIC ?? 'true').toLowerCase() !== 'false';
    if (!enabled) {
        console.log('Auto free-music disabled (AUTO_FREE_MUSIC=false).');
        return null;
    }

    const query = opts.query?.trim() || 'ambient lofi chill';
    const cacheDir = opts.cacheDir || resolveProjectPath('input', 'music', '__auto__');
    const providers = opts.preferProviders
        ? defaultProviders().filter((p) => opts.preferProviders!.includes(p.name))
        : defaultProviders();

    let lastError: string | null = null;
    for (const provider of providers) {
        try {
            const tracks = await provider.search(query, 5);
            if (tracks.length === 0) continue;
            const track = tracks[0];
            const ext = track.format || 'mp3';
            const cacheFile = path.join(cacheDir, `${sanitizeId(track.id)}.${ext}`);
            if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 1024) {
                console.log(`Reusing cached free music: ${track.title} (${track.provider})`);
                return { localPath: cacheFile, track };
            }
            await downloadTrack(track, cacheFile);
            console.log(`Auto-selected free music: ${track.title} (${track.provider}, ${track.license})`);
            return { localPath: cacheFile, track };
        } catch (err: any) {
            lastError = err?.message || String(err);
            console.warn(`Provider ${provider.name} failed: ${lastError}`);
        }
    }

    if (lastError) console.warn(`Free music resolution failed: ${lastError}`);
    return null;
}
