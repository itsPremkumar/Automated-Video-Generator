/**
 * audio-master.ts — ADVANCED: true loudness + sidechain master chain.
 *
 * Before: per-scene volume expression ducking only.
 * Now: broadcast-style master bus built as ffmpeg filter strings:
 *  - loudnorm (EBU R128) single-pass target
 *  - sidechaincompress music-under-voice (real ducking, not volume math)
 *  - acompressor + afftdn voice polish
 *  - beat-snapped cut adjustment (onset grid from BPM estimate)
 *
 * All builders are pure string functions — unit-testable without ffmpeg.
 */

export type MusicIntensity = 'calm' | 'mid' | 'energetic';

export interface MasterOpts {
    lufs?: number;
    truePeakDb?: number;
    lra?: number;
    duckStrength?: number;
    voiceGainDb?: number;
    musicGainDb?: number;
    normalize?: boolean;
}

export function bpmForIntensity(m: MusicIntensity | undefined): number {
    if (m === 'calm') return 80;
    if (m === 'energetic') return 128;
    return 104;
}

/** EBU R128 loudnorm filter (single pass). YouTube -14, podcast -16. */
export function loudnormFilter(lufs = -14, truePeakDb = -1.5, lra = 11): string {
    const i = Number.isFinite(lufs) ? lufs : -14;
    const tp = Number.isFinite(truePeakDb) ? truePeakDb : -1.5;
    const l = Number.isFinite(lra) ? lra : 11;
    return `loudnorm=I=${i}:TP=${tp}:LRA=${l}`;
}

/** Voice polish chain: highpass + de-noise-lite + compressor. */
export function voicePolishChain(opts: { denoise?: number; gainDb?: number } = {}): string {
    const parts = ['highpass=f=80'];
    if (opts.denoise && opts.denoise > 0) parts.push(`afftdn=nr=${Math.round(Math.min(1, opts.denoise) * 20)}`);
    parts.push('acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2dB');
    if (opts.gainDb) parts.push(`volume=${opts.gainDb}dB`);
    return parts.join(',');
}

/**
 * Full master filter_complex snippet for [voice][music] -> [out].
 * Uses sidechaincompress keyed by voice so music ducks only when speech present.
 */
export function masterChainFilter(opts: MasterOpts = {}): string {
    const duck = Math.max(0.5, Math.min(12, opts.duckStrength ?? 6));
    const vg = Number.isFinite(opts.voiceGainDb) ? `${opts.voiceGainDb}dB` : '0dB';
    const mg = Number.isFinite(opts.musicGainDb) ? `${opts.musicGainDb}dB` : '-14dB';
    const norm =
        opts.normalize === false ? '' : `,${loudnormFilter(opts.lufs ?? -14, opts.truePeakDb ?? -1.5, opts.lra ?? 11)}`;
    // [0:a] voice, [1:a] music
    return `[0:a]volume=${vg},apad[vox];[1:a]volume=${mg}[mus];[mus][vox]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=400:makeup=1[ducked];[vox][ducked]amix=inputs=2:duration=longest:dropout_transition=0${norm}[aout]`
        .replace('[0:a]', '[vox_in]')
        .replace('[1:a]', '[mus_in]');
}

/** Simpler dok: per-scene duck gains from energy curve (0..1 energy -> gain). */
export function duckGainsFromEnergy(energies: number[], base = 0.15, depth = 0.12): number[] {
    return energies.map((e) => {
        const clamped = Math.max(0, Math.min(1, e));
        // High energy -> music slightly louder, low energy -> music bed lower.
        return Math.round((base + (clamped - 0.5) * depth * 2) * 1000) / 1000;
    });
}

/** Snap scene boundaries to nearest beat grid (bpm). Keeps first/last fixed. */
export function snapCutsToBeats(boundaries: number[], bpm: number): number[] {
    if (boundaries.length < 3 || !(bpm > 0)) return [...boundaries];
    const beat = 60 / bpm;
    const out = [...boundaries];
    for (let i = 1; i < out.length - 1; i++) {
        const snapped = Math.round(out[i] / beat) * beat;
        // Never move more than half a beat (avoid destroying pacing).
        if (Math.abs(snapped - out[i]) <= beat / 2 + 1e-6) out[i] = Math.round(snapped * 1000) / 1000;
    }
    return out;
}

/** LUFS target per platform. */
export function lufsForPlatform(platform?: string): number {
    if (platform === 'youtube') return -14;
    if (platform === 'podcast') return -16;
    if (platform === 'tiktok' || platform === 'reels' || platform === 'instagram') return -14;
    return -14;
}
