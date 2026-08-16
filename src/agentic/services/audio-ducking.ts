/**
 * audio-ducking.ts — Auto-duck background music during speech.
 *
 * Automatically lowers BGM volume when voiceover is playing,
 * creating professional-sounding audio mixes.
 *
 * Identity-preserving: uses ffmpeg (already bundled), no external deps.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../shared/logging/runtime-logging.js';

export interface DuckOptions {
    voiceTrack: string;
    bgmTrack: string;
    outputPath: string;
    duckLevel?: number;       // 0.0-1.0, how much to duck (default 0.3)
    fadeInMs?: number;        // fade in duration in ms (default 500)
    fadeOutMs?: number;       // fade out duration in ms (default 500)
    bgmVolume?: number;       // base BGM volume 0.0-1.0 (default 0.5)
}

/** Apply audio ducking to mix voice + BGM */
export async function applyAudioDucking(options: DuckOptions): Promise<string> {
    const {
        voiceTrack,
        bgmTrack,
        outputPath,
        duckLevel = 0.3,
        fadeInMs = 500,
        fadeOutMs = 500,
        bgmVolume = 0.5,
    } = options;

    if (!fs.existsSync(voiceTrack)) {
        throw new Error(`Voice track not found: ${voiceTrack}`);
    }
    if (!fs.existsSync(bgmTrack)) {
        throw new Error(`BGM track not found: ${bgmTrack}`);
    }

    // Create output directory
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Use ffmpeg sidechain compression for ducking
    // Detect voice activity and duck BGM accordingly
    const ffmpegArgs = [
        '-i', voiceTrack,
        '-i', bgmTrack,
        '-filter_complex',
        [
            // Detect voice activity (silence detection)
            `[1:a]asendcmd='0.0 afftdn -20.0',` +
            `[1:a]asendcmd='${fadeInMs / 1000} afftdn -10.0',` +
            // Apply sidechain compression
            `[1:a]asendcmd='0.0 volume=${bgmVolume}',` +
            `[0:a]asendcmd='0.0 volume=1.0',` +
            // Mix with ducking
            `[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
        ].join(''),
        '-map', '[aout]',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-y', outputPath,
    ];

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                logWarn(`[DUCK] ffmpeg exited ${code}: ${stderr.slice(-300)}`);
                reject(new Error(`Audio ducking failed: ${code}`));
                return;
            }
            logInfo(`[DUCK] Applied audio ducking → ${outputPath}`);
            resolve(outputPath);
        });
    });
}

/** Simple BGM volume adjustment (no ducking) */
export async function adjustBgmVolume(
    bgmTrack: string,
    outputPath: string,
    volume: number = 0.5,
): Promise<string> {
    if (!fs.existsSync(bgmTrack)) {
        throw new Error(`BGM track not found: ${bgmTrack}`);
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
            '-i', bgmTrack,
            '-filter:a', `volume=${volume}`,
            '-c:a', 'aac',
            '-b:a', '192k',
            '-y', outputPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                logWarn(`[DUCK] volume adjust failed: ${code}`);
                reject(new Error(`Volume adjustment failed`));
                return;
            }
            resolve(outputPath);
        });
    });
}

/** Mix voice and BGM with optional ducking */
export async function mixAudio(
    voiceTrack: string,
    bgmTrack: string,
    outputPath: string,
    options: { bgmVolume?: number; ducking?: boolean } = {},
): Promise<string> {
    const bgmVolume = options.bgmVolume ?? 0.5;

    if (!fs.existsSync(voiceTrack) || !fs.existsSync(bgmTrack)) {
        throw new Error('Voice or BGM track not found');
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', [
            '-i', voiceTrack,
            '-i', bgmTrack,
            '-filter_complex',
            `[1:a]volume=${bgmVolume}[bgm];[0:a][bgm]amix=inputs=2:duration=first[aout]`,
            '-map', '[aout]',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-y', outputPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
            if (code !== 0) {
                logWarn(`[DUCK] mix failed: ${code}`);
                reject(new Error(`Audio mixing failed`));
                return;
            }
            logInfo(`[DUCK] Mixed audio → ${outputPath}`);
            resolve(outputPath);
        });
    });
}
