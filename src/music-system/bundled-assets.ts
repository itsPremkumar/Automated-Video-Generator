/**
 * src/music-system/bundled-assets.ts
 * Self-healing bundled music assets.
 *
 * input/bgm/__bundled__/ is git-ignored, so a fresh clone or a new git
 * worktree starts with ZERO bundled tracks — silently breaking the offline
 * music guarantee (BundledProvider is priority 1). This module generates a
 * minimal set of CC0 procedural tracks with ffmpeg-static whenever the
 * bundle dir is empty, so the pipeline (and tests) never depend on
 * untracked binary assets being present.
 *
 * Zero network. Zero paid keys. Idempotent.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { resolveMusicPath } from './config';

interface BundledSpec {
    baseName: string;
    title: string;
    mood: string[];
    genre: string;
    bpm: number;
    /** ffmpeg lavfi source expression for the tone bed */
    lavfi: string;
}

const DURATION_SEC = 60;

const SPECS: BundledSpec[] = [
    {
        baseName: 'bundled_calm_ambient',
        title: 'Calm Ambient Bed',
        mood: ['calm', 'ambient', 'peaceful'],
        genre: 'ambient',
        bpm: 70,
        lavfi: `sine=frequency=220:duration=${DURATION_SEC}`,
    },
    {
        baseName: 'bundled_dramatic_pulse',
        title: 'Dramatic Pulse',
        mood: ['dramatic', 'tense', 'epic'],
        genre: 'cinematic',
        bpm: 100,
        lavfi: `sine=frequency=110:duration=${DURATION_SEC}`,
    },
    {
        baseName: 'bundled_upbeat_drive',
        title: 'Upbeat Drive',
        mood: ['upbeat', 'energetic', 'happy'],
        genre: 'electronic',
        bpm: 128,
        lavfi: `sine=frequency=440:duration=${DURATION_SEC}`,
    },
];

function resolveFfmpeg(): string {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const p = require('ffmpeg-static') as string | null;
        if (p && fs.existsSync(p)) return p;
    } catch { /* fall through */ }
    return 'ffmpeg';
}

/** Count audio files currently in the bundle dir. */
export function countBundledTracks(bundleDir?: string): number {
    const dir = bundleDir ?? resolveMusicPath('input/bgm/__bundled__');
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).filter((f) => /\.(mp3|ogg|wav|m4a|flac)$/i.test(f)).length;
}

/**
 * Ensure the bundle dir contains at least `min` audio tracks with mood
 * metadata. Generates procedural CC0 tracks when short. Returns the number
 * of tracks present after the call. Safe to call repeatedly.
 */
export function ensureBundledTracks(bundleDir?: string, min = 3): number {
    const dir = bundleDir ?? resolveMusicPath('input/bgm/__bundled__');
    fs.mkdirSync(dir, { recursive: true });

    const existing = countBundledTracks(dir);
    if (existing >= min) return existing;

    const ffmpeg = resolveFfmpeg();
    for (const spec of SPECS) {
        const mp3 = path.join(dir, `${spec.baseName}.mp3`);
        const sidecar = path.join(dir, `${spec.baseName}.json`);
        if (!fs.existsSync(mp3) || fs.statSync(mp3).size < 50_000) {
            try {
                execFileSync(ffmpeg, [
                    '-y',
                    '-f', 'lavfi', '-i', spec.lavfi,
                    // gentle fade in/out so the bed loops without clicks
                    '-af', `afade=t=in:d=2,afade=t=out:st=${DURATION_SEC - 2}:d=2,volume=0.35`,
                    '-codec:a', 'libmp3lame', '-b:a', '96k',
                    mp3,
                ], { stdio: 'ignore', timeout: 60_000 });
            } catch {
                // ffmpeg unavailable — leave dir as-is; caller degrades gracefully
                continue;
            }
        }
        if (fs.existsSync(mp3)) {
            const meta = {
                title: spec.title,
                creator: 'AVS bundled (procedural)',
                mood: spec.mood,
                genre: spec.genre,
                bpm: spec.bpm,
                durationSec: DURATION_SEC,
                license: 'CC0 1.0 Universal',
                licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
                tags: ['bundled', 'cc0', 'procedural', ...spec.mood],
            };
            // Write directly (idempotent). Avoiding a !existsSync(sidecar)
            // check-then-write removes the TOCTOU race flagged by CodeQL
            // (js/file-system-race): the sidecar could appear between the
            // check and the write. CodeQL: js/file-system-race.
            fs.writeFileSync(sidecar, JSON.stringify(meta, null, 2));
        }
    }
    return countBundledTracks(dir);
}
