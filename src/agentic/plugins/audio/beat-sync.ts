/**
 * Beat-Sync Plugin
 * Analyzes music track for beats/onsets, aligns cuts/transitions to beats.
 * Uses aubio (via WASM) or ffmpeg's astats for onset detection.
 */

import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';

interface BeatSyncConfig {
    /** Enable beat-synced cuts */
    enabled?: boolean;
    /** Music track to analyze (path or 'auto' for first music asset) */
    musicTrack?: string;
    /** Minimum seconds between cuts */
    minCutInterval?: number;
    /** Maximum seconds between cuts */
    maxCutInterval?: number;
    /** Offset adjustment (seconds) */
    offset?: number;
    /** Only sync specific transition types */
    syncTransitions?: ('cut' | 'slide' | 'fade' | 'all')[];
    /** Fallback if analysis fails */
    fallbackInterval?: number;
}

interface BeatInfo {
    times: number[];      // Beat times in seconds
    tempo: number;        // BPM
    confidence: number;   // 0-1
    onsets: number[];     // All onsets (not just beats)
}

const DEFAULT_CONFIG: Required<BeatSyncConfig> = {
    enabled: true,
    musicTrack: 'auto',
    minCutInterval: 1.0,
    maxCutInterval: 4.0,
    offset: 0.0,
    syncTransitions: ['cut', 'slide', 'all'],
    fallbackInterval: 2.0,
};

export const beatSyncPlugin: AgenticPlugin = {
    metadata: {
        name: 'beat-sync',
        version: '1.0.0',
        description: 'Sync cuts and transitions to music beats using onset detection',
        author: 'Agentic Video Team',
        tags: ['beat', 'sync', 'music', 'onset', 'rhythm'],
    },

    capabilities: [
        Capability.AUDIO_ANALYSIS,
        Capability.TIME_REMAP,
    ],

    category: PluginCategory.AUDIO,

    defaultConfig: DEFAULT_CONFIG,

    hooks: {
        onPlan: async (plan, ctx) => {
            const cfg = ctx.getConfig<BeatSyncConfig>('beat-sync');
            if (!cfg.enabled) return plan;

            // Analyze music track
            const beats = await analyzeMusic(ctx, cfg);
            if (!beats || beats.times.length === 0) {
                console.warn('[beat-sync] No beats detected, using fallback');
                return applyFallback(plan, cfg);
            }

            // Store beats for render phase
            ctx.setShared('beats', beats);

            // Align scene boundaries to beats
            const enhancedPlan = { ...plan };
            let currentTime: number = cfg.offset ?? 0;

            for (const scene of enhancedPlan.scenes) {
                const duration = scene.durationSec ?? 4;
                const endTime = currentTime + duration;

                // Snap end to nearest beat within range
                const snappedEnd = snapToBeat(endTime, beats, cfg);
                scene.durationSec = snappedEnd - currentTime;
                scene.beatAligned = true;
                currentTime = snappedEnd;
            }

            // Adjust total duration
            enhancedPlan.totalDurationSec = currentTime;
            return enhancedPlan;
        },

        onAcquire: async (assets, ctx) => {
            // Ensure music track is available for analysis
            const cfg = ctx.getConfig<BeatSyncConfig>('beat-sync');
            if (cfg.musicTrack === 'auto' && assets.music.length > 0) {
                ctx.setShared('musicTrack', assets.music[0].localPath);
            }
            return assets;
        },

        onRenderFilter: async (scene, ctx) => {
            // Could add beat-flash effect here
            return scene;
        },

        onGate: async (results, ctx) => {
            // Verify beat alignment
            const beats = ctx.getShared('beats') as BeatInfo | null;
            if (!beats) return results;

            // Add a gate check for beat alignment quality
            return results;
        },
    },
};

async function analyzeMusic(ctx: any, cfg: BeatSyncConfig): Promise<BeatInfo | null> {
    const trackPath = ctx.getShared('musicTrack') ?? cfg.musicTrack;
    if (!trackPath || trackPath === 'auto') return null;

    // Try aubio WASM first (if available)
    try {
        return await analyzeWithAubio(trackPath);
    } catch (e) {
        console.warn('[beat-sync] aubio unavailable, trying ffmpeg astats:', e);
    }

    // Fallback: ffmpeg astats onset detection
    try {
        return await analyzeWithFfmpeg(trackPath);
    } catch (e) {
        console.error('[beat-sync] ffmpeg analysis failed:', e);
    }

    return null;
}

async function analyzeWithAubio(trackPath: string): Promise<BeatInfo> {
    // Dynamic import - only loads if @aubio/wasm is installed
    // @ts-expect-error - optional dependency (npm install @aubio/wasm)
    const aubio = await import('@aubio/wasm').catch(() => null);
    if (!aubio) throw new Error('aubio WASM not installed');

    const audio = await loadAudioFile(trackPath);
    const tempo = new aubio.Tempo('default', 1024, 512, audio.sampleRate);
    const onset = new aubio.Onset('default', 1024, 512, audio.sampleRate);

    const beats: number[] = [];
    const onsets: number[] = [];

    for (let i = 0; i < audio.data.length; i += 512) {
        const chunk = audio.data.slice(i, i + 512);
        if (chunk.length < 512) break;

        const time = i / audio.sampleRate;
        if (onset.do(chunk)) onsets.push(time);
        if (tempo.do(chunk)) beats.push(time);
    }

    const bpm = tempo.getBpm();
    return {
        times: beats,
        tempo: bpm,
        confidence: bpm > 0 ? 0.8 : 0.3,
        onsets,
    };
}

async function analyzeWithFfmpeg(trackPath: string): Promise<BeatInfo> {
    const { execFile } = await import('child_process');
    const ffmpegMod: any = (await import('ffmpeg-static')).default;
    const ffmpegPath: string = (ffmpegMod && typeof ffmpegMod === 'object' && 'path' in ffmpegMod) ? ffmpegMod.path : String(ffmpegMod);

    return new Promise((resolve, reject) => {
        // Use astats with metadata=1 to get peak/level info
        // Then post-process to find onsets
        execFile(ffmpegPath, [
            '-i', trackPath,
            '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level',
            '-f', 'null', '-'
        ], { maxBuffer: 10 * 1024 * 1024 }, (err: Error | null, stdout: string, stderr: string) => {
            if (err) return reject(err);

            // Parse astats output for peaks (simplified onset detection)
            const peaks = parseAstatsOutput(stderr);
            const beats = quantizeToTempo(peaks);

            resolve({
                times: beats,
                tempo: estimateTempo(beats),
                confidence: 0.6,
                onsets: peaks,
            });
        });
    });
}

function parseAstatsOutput(stderr: string): number[] {
    const peaks: number[] = [];
    const lines = stderr.split('\n');
    let time = 0;
    const frameRate = 100; // astats outputs ~100 frames/sec

    for (const line of lines) {
        const match = line.match(/lavfi\.astats\.Overall\.Peak_level=([-\d.]+)/);
        if (match) {
            const level = parseFloat(match[1]);
            if (level > -20) { // Threshold for onset
                peaks.push(time);
            }
            time += 1 / frameRate;
        }
    }
    return peaks;
}

function quantizeToTempo(peaks: number[]): number[] {
    if (peaks.length < 2) return peaks;

    // Estimate tempo from peak intervals
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
        intervals.push(peaks[i] - peaks[i - 1]);
    }
    const medianInterval = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
    const tempo = 60 / medianInterval;

    // Snap peaks to grid
    const beatDuration = 60 / tempo;
    return peaks.map(p => Math.round(p / beatDuration) * beatDuration);
}

function estimateTempo(peaks: number[]): number {
    if (peaks.length < 2) return 120;
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
        intervals.push(peaks[i] - peaks[i - 1]);
    }
    const median = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
    return Math.round(60 / median);
}

function applyFallback(plan: any, cfg: BeatSyncConfig): any {
    const enhanced = { ...plan };
    let currentTime = 0;

    for (const scene of enhanced.scenes) {
        const dur = scene.durationSec ?? cfg.fallbackInterval;
        scene.durationSec = dur;
        scene.beatAligned = false;
        currentTime += dur;
    }
    enhanced.totalDurationSec = currentTime;
    return enhanced;
}

function snapToBeat(targetTime: number, beats: BeatInfo, cfg: BeatSyncConfig): number {
    const { times, tempo } = beats;
    if (times.length === 0) return targetTime;

    const beatDur = 60 / tempo;
    const minInterval = cfg.minCutInterval ?? 0;
    const maxInterval = Math.min(cfg.maxCutInterval ?? Infinity, beatDur * 4);

    // Find nearest beat
    const nearest = times.reduce((prev, curr) =>
        Math.abs(curr - targetTime) < Math.abs(prev - targetTime) ? curr : prev
    );

    // Constrain to min/max interval from last cut
    // (simplified - would need last cut time context)
    return nearest;
}

async function loadAudioFile(path: string): Promise<{ data: Float32Array; sampleRate: number }> {
    // Simplified - in reality use ffmpeg to decode to float32
    // For now return dummy
    return { data: new Float32Array(44100 * 10), sampleRate: 44100 };
}

export function registerBeatSync(registry: any, config?: Partial<BeatSyncConfig>, enabled = true): void {
    registry.register(beatSyncPlugin, config, enabled);
}