/**
 * ai/intelligence/beat-sync.ts — beat detection and music-synced editing.
 *
 * Detects beats in background music and maps them to scene cuts.
 * Uses librosa (Python) for beat tracking.
 *
 * Identity-preserving: returns empty array if detection fails.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { logInfo } from '../../../shared/logging/runtime-logging.js';

const BEAT_SYNC_SCRIPT = process.env.BEAT_SYNC_SCRIPT || '';
const BEAT_SYNC_URL = process.env.BEAT_SYNC_URL || 'http://127.0.0.1:8192';
const BEAT_SYNC_TIMEOUT = Math.max(10000, Number(process.env.BEAT_SYNC_TIMEOUT_MS || 60000));

export interface BeatResult {
    beats: number[];       // timestamps in seconds
    bpm: number;           // estimated tempo
    durationSec: number;
}

/** Check if beat detection is available. */
export function isEnabled(): boolean {
    return !!BEAT_SYNC_SCRIPT || true;
}

/** Check if beat-sync server is reachable. */
export async function isAvailable(): Promise<boolean> {
    if (BEAT_SYNC_SCRIPT && fs.existsSync(BEAT_SYNC_SCRIPT)) return true;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`${BEAT_SYNC_URL}/health`, { signal: ctrl.signal });
        clearTimeout(t);
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Detect beats in an audio file.
 * Returns BeatResult or null on failure.
 */
export async function detectBeats(opts: {
    audioPath: string;
}): Promise<BeatResult | null> {
    if (!fs.existsSync(opts.audioPath)) {
        logInfo('[BEAT-SYNC] Audio file not found');
        return null;
    }

    // Option 1: Use standalone script
    if (BEAT_SYNC_SCRIPT && fs.existsSync(BEAT_SYNC_SCRIPT)) {
        return await runScript(opts.audioPath);
    }

    // Option 2: Use server API
    try {
        return await runServerApi(opts.audioPath);
    } catch (e: any) {
        logInfo(`[BEAT-SYNC] Failed: ${e?.message ?? e}`);
        return null;
    }
}

async function runScript(audioPath: string): Promise<BeatResult | null> {
    return new Promise((resolve) => {
        const proc = spawn('python', [
            BEAT_SYNC_SCRIPT,
            audioPath,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) {
                logInfo(`[BEAT-SYNC] Script failed: ${stderr.slice(-200)}`);
                resolve(null);
                return;
            }
            try {
                const result = JSON.parse(stdout) as BeatResult;
                resolve(result);
            } catch {
                resolve(null);
            }
        });
        setTimeout(() => { proc.kill(); resolve(null); }, BEAT_SYNC_TIMEOUT);
    });
}

async function runServerApi(audioPath: string): Promise<BeatResult | null> {
    const formData = new FormData();
    const audioBuffer = fs.readFileSync(audioPath);
    formData.append('audio', new Blob([audioBuffer], { type: 'audio/mpeg' }));

    const res = await fetch(`${BEAT_SYNC_URL}/detect`, {
        method: 'POST',
        body: formData,
    });
    if (!res.ok) return null;

    return await res.json() as BeatResult;
}

/**
 * Map beats to scene durations for cut-on-beat editing.
 * Returns array of beat timestamps that align with scene boundaries.
 */
export function mapBeatsToScenes(
    beats: number[],
    sceneDurations: number[],
): number[] {
    const cutPoints: number[] = [];
    let accumulated = 0;

    for (const dur of sceneDurations) {
        accumulated += dur;
        // Find the closest beat to this cut point
        let closest = beats[0] || 0;
        let minDist = Math.abs(closest - accumulated);
        for (const b of beats) {
            const dist = Math.abs(b - accumulated);
            if (dist < minDist) {
                minDist = dist;
                closest = b;
            }
        }
        cutPoints.push(closest);
    }

    return cutPoints;
}
