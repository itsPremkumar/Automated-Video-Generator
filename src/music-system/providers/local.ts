/**
 * src/music-system/providers/local.ts
 * Local user tracks from input/bgm/ — offline, instant, user-curated.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MusicTrack, MusicQuery } from '../types';
import { BaseMusicProvider } from './base';
import { resolveMusicPath } from '../config';

const AUDIO_EXTS = new Set(['mp3', 'ogg', 'wav', 'm4a', 'flac', 'aac']);

export class LocalProvider extends BaseMusicProvider {
    readonly name = 'local';
    readonly label = 'Local user tracks';
    readonly priority = 2;
    readonly requiresNetwork = false;

    private musicDir: string;

    constructor(musicDir?: string) {
        super();
        this.musicDir = musicDir || resolveMusicPath('input/bgm');
    }

    async search(_query: MusicQuery, count = 5): Promise<MusicTrack[]> {
        if (!fs.existsSync(this.musicDir)) return [];

        const entries = fs.readdirSync(this.musicDir, { withFileTypes: true });
        const out: MusicTrack[] = [];

        for (const entry of entries) {
            if (entry.isDirectory()) continue;
            const ext = entry.name.split('.').pop()?.toLowerCase() || '';
            if (!AUDIO_EXTS.has(ext)) continue;
            if (entry.name.startsWith('__auto__') || entry.name.startsWith('__bundled__')) continue;

            out.push({
                id: `local_${entry.name}`,
                title: entry.name.replace(/\.[^.]+$/, ''),
                creator: 'Local asset',
                license: 'User-provided (assumed royalty-free)',
                licenseUrl: '',
                provider: this.name,
                downloadUrl: '', // local — no network download
                genre: 'local',
                format: ext,
                tags: ['local', 'user'],
                durationSec: 0,
            });
            if (out.length >= count) break;
        }
        return out;
    }

    async download(track: MusicTrack, destPath: string): Promise<string> {
        const fileName = track.id.replace(/^local_/, '');
        const src = path.join(this.musicDir, fileName);
        if (!fs.existsSync(src)) {
            throw new Error(`Local track not found: ${src}`);
        }
        this.ensureDir(destPath);
        fs.copyFileSync(src, destPath);
        return destPath;
    }
}
