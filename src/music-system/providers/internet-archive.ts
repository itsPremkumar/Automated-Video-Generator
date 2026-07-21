/**
 * src/music-system/providers/internet-archive.ts
 * Internet Archive public domain / CC audio search.
 *
 * Note: Download URLs must be resolved per-track because IA stores
 * files with varying filenames (not always {identifier}.mp3).
 */

import axios from 'axios';
import * as fs from 'fs';
import type { MusicTrack, MusicQuery } from '../types';
import { BaseMusicProvider, withSignal } from './base';

const PROVIDER_TIMEOUT = 15_000;

export class InternetArchiveProvider extends BaseMusicProvider {
    readonly name = 'internet-archive';
    readonly label = 'Internet Archive (Public Domain)';
    readonly priority = 6;
    readonly requiresNetwork = true;

    async search(query: MusicQuery, count = 5): Promise<MusicTrack[]> {
        const searchTerms = [query.topic, ...(query.preferredGenres || [])]
            .filter(Boolean)
            .join(' ');

        const q = encodeURIComponent(`(${searchTerms || 'ambient'}) AND mediatype:audio AND (licenseurl:*)`)
            .replace(/%20/g, '+');

        const searchUrl = `https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&fl[]=downloads&sort[]=downloads+desc&rows=${count}&output=json`;

        const res = await withSignal(
            (signal) => axios.get(searchUrl, { timeout: PROVIDER_TIMEOUT, signal }),
            PROVIDER_TIMEOUT,
            'internet-archive search',
        );

        const docs = (res.data as any)?.response?.docs || [];
        const tracks: MusicTrack[] = [];

        for (const d of docs) {
            const identifier = d.identifier as string;
            if (!identifier) continue;

            // Resolve actual download URL via metadata API
            const downloadUrl = await this.resolveDownloadUrl(identifier);
            if (!downloadUrl) continue;

            tracks.push({
                id: `ia_${identifier}`,
                title: (d.title as string) || identifier,
                creator: (d.creator as string) || 'Internet Archive',
                license: (d.licenseurl as string) || 'Public Domain',
                licenseUrl: (d.licenseurl as string) || 'https://archive.org',
                provider: this.name,
                downloadUrl,
                genre: 'archive',
                format: downloadUrl.endsWith('.mp3') ? 'mp3' : 'ogg',
                tags: ['archive.org', 'public-domain', query.topic || 'ambient'],
                durationSec: 0,
            } as MusicTrack);

            if (tracks.length >= count) break;
        }

        return tracks;
    }

    private async resolveDownloadUrl(identifier: string): Promise<string | null> {
        try {
            const metaUrl = `https://archive.org/metadata/${identifier}`;
            const res = await withSignal(
                (signal) => axios.get(metaUrl, { timeout: PROVIDER_TIMEOUT, signal }),
                PROVIDER_TIMEOUT,
                `ia metadata ${identifier}`,
            );

            const files = (res.data as any)?.files || [];
            // Find first playable audio file (not spectrogram, not source zip)
            const audioFile = files.find((f: any) => {
                const name: string = f.name || '';
                const source: string = f.source || '';
                const format: string = f.format || '';
                return (
                    (name.endsWith('.mp3') || name.endsWith('.ogg')) &&
                    !name.includes('spectrogram') &&
                    !name.includes('_spectrogram') &&
                    !name.endsWith('.zip') &&
                    source !== 'original' && // skip raw source files
                    !format.toLowerCase().includes('spectrogram')
                );
            });

            if (audioFile?.name) {
                return `https://archive.org/download/${identifier}/${audioFile.name}`;
            }

            // Fallback: try {identifier}.mp3 even though it often fails
            return `https://archive.org/download/${identifier}/${identifier}.mp3`;
        } catch {
            return null;
        }
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
