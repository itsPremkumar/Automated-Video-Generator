/**
 * src/music-system/providers/bundled.ts
 * Bundled tracks shipped with the repo in input/bgm/__bundled__/.
 * Always available, zero network, instant.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MusicTrack, MusicQuery } from '../types';
import { BaseMusicProvider } from './base';
import { resolveMusicPath } from '../config';

const AUDIO_EXTS = new Set(['mp3', 'ogg', 'wav', 'm4a', 'flac']);

interface BundledMetadata {
    title: string;
    creator: string;
    mood?: string[];
    genre?: string;
    bpm?: number;
    durationSec?: number;
    license?: string;
    licenseUrl?: string;
    tags?: string[];
}

export class BundledProvider extends BaseMusicProvider {
    readonly name = 'bundled';
    readonly label = 'Bundled tracks';
    readonly priority = 1; // Highest — always available, zero latency
    readonly requiresNetwork = false;

    private bundleDir: string;
    private metadata: Map<string, BundledMetadata> = new Map();

    constructor(bundleDir?: string) {
        super();
        this.bundleDir = bundleDir || resolveMusicPath('input/bgm/__bundled__');
        this.loadMetadata();
    }

    /**
     * Scan the bundle dir for metadata. Two sources are supported:
     *   1. Per-track sidecar JSON: `<base>.json` describes `<base>.<ext>`
     *      (these take precedence when present).
     *   2. Aggregated `metadata.json`: an array of
     *      `{ filename, title, mood, ... }` entries keyed by filename.
     */
    private loadMetadata(): void {
        if (!fs.existsSync(this.bundleDir)) {
            fs.mkdirSync(this.bundleDir, { recursive: true });
            return;
        }
        const entries = fs.readdirSync(this.bundleDir, { withFileTypes: true });

        // 1. Per-track sidecar JSON files (excluding the aggregated one)
        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const name = entry.name;
            if (name.endsWith('.json') && name !== 'metadata.json') {
                try {
                    const meta: BundledMetadata = JSON.parse(
                        fs.readFileSync(path.join(this.bundleDir, name), 'utf-8'),
                    );
                    const baseName = name.replace(/\.json$/, '');
                    this.metadata.set(baseName, meta);
                } catch {
                    // invalid JSON — skip silently
                }
            }
        }

        // 2. Aggregated metadata.json: array of { filename, ... }
        const aggPath = path.join(this.bundleDir, 'metadata.json');
        if (fs.existsSync(aggPath)) {
            try {
                const arr = JSON.parse(
                    fs.readFileSync(aggPath, 'utf-8'),
                ) as Array<BundledMetadata & { filename?: string }>;
                if (Array.isArray(arr)) {
                    for (const item of arr) {
                        const baseName = (item.filename || '').replace(/\.[^.]+$/, '');
                        if (!baseName) continue;
                        // Don't clobber a more specific sidecar if present
                        if (this.metadata.has(baseName)) continue;
                        this.metadata.set(baseName, item);
                    }
                }
            } catch {
                // invalid JSON — skip silently
            }
        }
    }

    async search(query: MusicQuery, count = 5): Promise<MusicTrack[]> {
        if (!fs.existsSync(this.bundleDir)) return [];

        const entries = fs.readdirSync(this.bundleDir, { withFileTypes: true });
        const out: MusicTrack[] = [];

        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const ext = entry.name.split('.').pop()?.toLowerCase() || '';
            if (!AUDIO_EXTS.has(ext)) continue;
            if (entry.name.startsWith('.')) continue;

            const baseName = entry.name.replace(/\.[^.]+$/, '');
            const meta = this.metadata.get(baseName);

            // Mood match: when the query asks for a specific mood, a track must
            // declare a matching mood. Tracks with no mood metadata cannot
            // satisfy a specific mood request, so they are excluded (this is
            // what makes an unknown mood like 'metal' yield zero results).
            if (query.mood !== 'any') {
                if (!meta?.mood?.length) continue;
                if (!meta.mood.some(m => m.toLowerCase() === query.mood)) continue;
            }

            const track: MusicTrack = {
                id: `bundled_${baseName}`,
                title: meta?.title || baseName.replace(/_/g, ' '),
                creator: meta?.creator || 'Bundled asset',
                license: meta?.license || 'CC0 1.0 Universal',
                licenseUrl: meta?.licenseUrl || 'https://creativecommons.org/publicdomain/zero/1.0/',
                provider: this.name,
                downloadUrl: '', // local — no download needed
                genre: meta?.genre || 'ambient',
                format: ext,
                tags: meta?.tags || ['bundled', 'cc0'],
                durationSec: meta?.durationSec || 0,
                bpm: meta?.bpm,
                mood: meta?.mood,
            };

            out.push(track);
            if (out.length >= count) break;
        }

        return out;
    }

    async download(track: MusicTrack, destPath: string): Promise<string> {
        const baseName = track.id.replace(/^bundled_/, '');
        const ext = track.format;

        // Try known extensions
        const candidates = [ext, ...AUDIO_EXTS].filter(Boolean);
        for (const e of candidates) {
            const src = path.join(this.bundleDir, `${baseName}.${e}`);
            if (fs.existsSync(src)) {
                this.ensureDir(destPath);
                fs.copyFileSync(src, destPath);
                return destPath;
            }
        }

        throw new Error(`Bundled track not found: ${baseName}`);
    }
}
