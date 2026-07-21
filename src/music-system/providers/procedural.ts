/**
 * src/music-system/providers/procedural.ts
 * Procedural music generator — always works, zero network.
 *
 * Generates musical ambient via ffmpeg lavfi with 3 profiles:
 *   - ambient:   Gentle C major chord pad with LFO + reverb
 *   - upbeat:    Sawtooth bass + filtered chord + gentle arpeggio
 *   - cinematic: Sub-bass + strings pad + slow riser
 *
 * Always the LAST provider in the chain (priority 99) — the
 * never-fails guarantee.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MusicTrack, MusicQuery } from '../types';
import { BaseMusicProvider, runFfmpeg, probeDuration } from './base';

type ProceduralProfile = 'ambient' | 'upbeat' | 'cinematic';

/** Build ffmpeg filter_complex for each profile */
function buildFilterGraph(profile: ProceduralProfile, durationSec: number): {
    inputs: string[];
    filterComplex: string;
} {
    switch (profile) {
        case 'ambient':
            return buildAmbient(durationSec);
        case 'upbeat':
            return buildUpbeat(durationSec);
        case 'cinematic':
            return buildCinematic(durationSec);
    }
}

function buildAmbient(durationSec: number) {
    const dur = Math.ceil(durationSec);
    return {
        inputs: [
            '-f', 'lavfi', '-i', `sine=f=261.63:d=${dur}`,  // C4
            '-f', 'lavfi', '-i', `sine=f=329.63:d=${dur}`,  // E4
            '-f', 'lavfi', '-i', `sine=f=392.00:d=${dur}`,  // G4
            '-f', 'lavfi', '-i', `sine=f=523.25:d=${dur},volume=0.3`, // C5 (airy top)
        ],
        filterComplex: [
            '[0:a][1:a][2:a][3:a]amix=inputs=4:duration=longest:normalize=0[mixed]',
            '[mixed]volume=0.12[quiet]',
            '[quiet]lowpass=f=800[low]',
            '[low]tremolo=f=0.3:d=0.6[trem]',
            '[trem]aphaser=type=triangular:decay=0.7:delay=5[phased]',
            '[phased]aecho=0.8:0.7:40|120:0.4|0.2[echo]',
            '[echo]alimiter=limit=0.5:asc=1:level=disabled[out]',
        ].join('; '),
    };
}

function buildUpbeat(durationSec: number) {
    const dur = Math.ceil(durationSec);
    return {
        inputs: [
            '-f', 'lavfi', '-i', `sawtooth=f=130.81:d=${dur}`,           // C3 bass
            '-f', 'lavfi', '-i', `sine=f=261.63:d=${dur}`,               // C4
            '-f', 'lavfi', '-i', `sine=f=329.63:d=${dur},volume=0.5`,    // E4
            '-f', 'lavfi', '-i', `sine=f=392.00:d=${dur},volume=0.5`,    // G4
        ],
        filterComplex: [
            '[0:a]volume=0.08,lowpass=f=200[bass]',
            '[1:a][2:a][3:a]amix=inputs=3:duration=longest:normalize=0[chord]',
            '[chord]volume=0.1,lowpass=f=4000[chordf]',
            '[chordf]acompressor=threshold=0.1:ratio=4:attack=5:release=50[chordc]',
            '[bass][chordc]amix=inputs=2:duration=longest:normalize=0[mix]',
            '[mix]alimiter=limit=0.6:asc=1:level=disabled[out]',
        ].join('; '),
    };
}

function buildCinematic(durationSec: number) {
    const dur = Math.ceil(durationSec);
    return {
        inputs: [
            '-f', 'lavfi', '-i', `sine=f=65.41:d=${dur},volume=0.15`,    // C2 sub-bass
            '-f', 'lavfi', '-i', `sine=f=261.63:d=${dur}`,               // C4
            '-f', 'lavfi', '-i', `sine=f=329.63:d=${dur}`,               // E4
            '-f', 'lavfi', '-i', `sine=f=392.00:d=${dur}`,               // G4
            '-f', 'lavfi', '-i', `anoisesrc=color=pink:duration=${dur},volume=0.03`, // pink texture
        ],
        filterComplex: [
            '[2:a][3:a]amix=inputs=2:duration=longest:normalize=0[strings]',
            '[strings]volume=0.08,aecho=0.8:0.7:60:0.3[stringspad]',
            '[0:a][1:a]amix=inputs=2:duration=longest:normalize=0[base]',
            '[base]volume=0.06[basev]',
            '[basev][stringspad]amix=inputs=2:duration=longest:normalize=0[mix]',
            '[mix]volume=0.15:eval=frame:enable=\'gte(t,0)\',volume=0.15*min(t/4,1):eval=frame:enable=\'lt(t,4)\'[swell]',
            '[swell][4:a]amix=inputs=2:duration=longest:normalize=1[noise]',
            '[noise]alimiter=limit=0.55:asc=1:level=disabled[out]',
        ].join('; '),
    };
}

/** Map a MusicQuery mood to a procedural profile */
function moodToProfile(query: MusicQuery): ProceduralProfile {
    const preferred = query.preferredGenres?.[0]?.toLowerCase() || '';
    if (preferred.includes('upbeat') || preferred.includes('energetic')) return 'upbeat';
    if (preferred.includes('cinematic') || preferred.includes('epic')) return 'cinematic';
    switch (query.mood) {
        case 'upbeat': return 'upbeat';
        case 'dramatic':
        case 'dark': return 'cinematic';
        case 'professional': return 'cinematic';
        case 'calm':
        case 'nostalgic':
        default: return 'ambient';
    }
}

export class ProceduralProvider extends BaseMusicProvider {
    readonly name = 'procedural';
    readonly label = 'Procedural Generator';
    readonly priority = 99; // Always last
    readonly requiresNetwork = false;

    /** Generate a procedural track. Returns the output path. */
    async generate(destPath: string, query: MusicQuery): Promise<string> {
        this.ensureDir(destPath);

        const profile = moodToProfile(query);
        const durationSec = query.targetDurationSec;
        const { inputs, filterComplex } = buildFilterGraph(profile, durationSec);

        const args = [
            ...inputs,
            '-filter_complex', filterComplex,
            '-map', '[out]',
            '-ac', '1',
            '-ar', '44100',
            '-y',
            destPath,
        ];

        const { code, stderr } = await runFfmpeg(args, 60_000);

        if (code !== 0) {
            throw new Error(
                `Procedural generation failed (exit ${code}, profile ${profile}): ${stderr.slice(0, 300)}`,
            );
        }

        if (!fs.existsSync(destPath) || fs.statSync(destPath).size < 1024) {
            throw new Error(`Procedural generation produced empty file for profile ${profile}`);
        }

        return destPath;
    }

    async search(query: MusicQuery): Promise<MusicTrack[]> {
        const profile = moodToProfile(query);
        return [{
            id: `procedural_${profile}_${query.targetDurationSec}s`,
            title: `Procedural ${profile} (${query.targetDurationSec}s)`,
            creator: 'Generated (CC0)',
            license: 'CC0 1.0 Universal (Public Domain)',
            licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
            provider: this.name,
            downloadUrl: '__ffmpeg_generated__',
            genre: profile,
            format: 'wav',
            tags: ['procedural', 'generated', profile, query.mood],
            durationSec: query.targetDurationSec,
        }];
    }

    async download(track: MusicTrack, destPath: string): Promise<string> {
        // download = generate for procedural tracks
        const profile = (track.genre as ProceduralProfile) || 'ambient';
        const durationSec = track.durationSec || 30;
        const { inputs, filterComplex } = buildFilterGraph(profile, durationSec);

        this.ensureDir(destPath);

        const args = [
            ...inputs,
            '-filter_complex', filterComplex,
            '-map', '[out]',
            '-ac', '1',
            '-ar', '44100',
            '-y',
            destPath,
        ];

        const { code, stderr } = await runFfmpeg(args, 60_000);
        if (code !== 0) {
            throw new Error(
                `Procedural generation failed (exit ${code}): ${stderr.slice(0, 300)}`,
            );
        }
        return destPath;
    }
}
