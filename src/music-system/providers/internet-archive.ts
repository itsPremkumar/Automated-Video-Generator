/**
 * src/music-system/providers/internet-archive.ts
 * Internet Archive public domain / CC audio search.
 */

import axios from 'axios';
import * as fs from 'fs';
import type { MusicTrack, MusicQuery } from '../types';
import { BaseMusicProvider, withSignal } from './base';

const PROVIDER_TIMEOUT = 12_000;

export class InternetArchiveProvider extends BaseMusicProvider {
    readonly name = 'internet-archive';
    readonly label = 'Internet Archive (Public Domain)';
    readonly priority = 6;
    readonly requiresNetwork = true;

    async search(query: MusicQuery, count = 5): Promise<MusicTrack[]> {
        // Build search query from topic + mood
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
                tags: ['archive.org', 'public-domain', query.topic || 'ambient'],
                durationSec: 0,
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
