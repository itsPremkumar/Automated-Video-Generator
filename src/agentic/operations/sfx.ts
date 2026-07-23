/**
 * sfx.ts — Sound-effects channel for the agentic pipeline.
 *
 * Royalty-free SFX via Openverse audio search (same zero-cost, no-API-key
 * ladder the image fetcher uses), plus ffmpeg-based loudness normalization
 * and music looping helpers used by the render stage.
 *
 * Everything here is OPTIONAL and OFF by default — the pipeline only touches
 * it when a job sets `sfxByScene` / `sfxOnCut` / `normalizeLufs` / `loopMusic`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

function ff(): string {
    const p = ffmpegPath as unknown as string;
    if (!p || !fs.existsSync(p)) throw new Error('ffmpeg-static binary not found');
    return p;
}

/** Openverse audio search — returns candidate URLs (no API key required). */
async function searchOpenverseAudio(query: string, count = 3): Promise<{ url: string; license?: string }[]> {
    const url = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(query)}&page_size=${count}`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'automated-video-generator/1.0' } });
        if (!res.ok) return [];
        const data = (await res.json()) as any;
        const results = Array.isArray(data?.results) ? data.results : [];
        return results
            .map((r: any) => ({ url: r.audio_url || r.url, license: r.license }))
            .filter((x: any) => !!x.url);
    } catch {
        return [];
    }
}

/** A tiny built-in fallback so SFX never hard-fails offline: generate a short
 *  silent/tone clip locally with ffmpeg (acts as a placeholder marker). */
function makeFallbackTone(outPath: string, ms = 400): void {
    try {
        execFileSync(ff(), [
            '-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${ms / 1000}`,
            '-ac', '1', '-ar', '44100', outPath,
        ], { stdio: 'ignore' });
    } catch (e: any) {
        // Tone is a non-fatal placeholder; log the real cause for observability.
        console.warn(`  ⚠ makeFallbackTone failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
    }
}

export interface SfxFetchResult {
    sceneIndex: number;
    localPath: string;
    query: string;
    fromCache: boolean;
}

/** Fetch one SFX clip for a scene, return the local path (cached by query). */
export async function fetchSfxForScene(
    query: string,
    sceneIndex: number,
    outDir: string,
): Promise<SfxFetchResult> {
    fs.mkdirSync(outDir, { recursive: true });
    const safe = query.replace(/[^a-z0-9]+/gi, '_').toLowerCase().slice(0, 40);
    const cacheName = `sfx_${sceneIndex}_${safe}.mp3`;
    const dest = path.join(outDir, cacheName);
    if (fs.existsSync(dest)) return { sceneIndex, localPath: dest, query, fromCache: true };

    const items = await searchOpenverseAudio(query, 3);
    let wrote = false;
    for (const it of items) {
        try {
            execFileSync(ff(), ['-y', '-i', it.url, '-t', '5', '-ac', '1', '-ar', '44100', dest], { stdio: 'ignore', timeout: 20000 });
            if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { wrote = true; break; }
        } catch (e: any) {
            console.warn(`  ⚠ sfx fetch failed for "${query}": ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
        }
    }
    if (!wrote) makeFallbackTone(dest);
    return { sceneIndex, localPath: dest, query, fromCache: false };
}

/** Resolve all SFX for a job from `sfxByScene` + optional `sfxOnCut`. */
export async function resolveSfx(
    job: { sfxByScene?: Record<number, string>; sfxOnCut?: boolean },
    sceneCount: number,
    outDir: string,
): Promise<SfxFetchResult[]> {
    const out: SfxFetchResult[] = [];
    if (job.sfxByScene) {
        for (const [idxStr, q] of Object.entries(job.sfxByScene)) {
            out.push(await fetchSfxForScene(q, Number(idxStr), outDir));
        }
    }
    if (job.sfxOnCut) {
        for (let i = 0; i < sceneCount - 1; i++) {
            out.push(await fetchSfxForScene('whoosh', i, outDir));
        }
    }
    return out;
}

/** Normalize an audio file (or the audio track of a video) to target LUFS
 *  using ffmpeg loudnorm (two-pass, simplified single-pass here). */
export function normalizeAudio(input: string, output: string, targetLufs = -14): string {
    const p = ff();
    if (!fs.existsSync(input)) return input;
    try {
        execFileSync(p, [
            '-y', '-i', input,
            '-af', `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`,
            '-ar', '44100', '-ac', '2', output,
        ], { stdio: 'ignore', timeout: 60000 });
    } catch (e: any) {
        console.warn(`  ⚠ normalizeAudio failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
        return input;
    }
    return fs.existsSync(output) && fs.statSync(output).size > 0 ? output : input;
}

/** Loop an audio file to a target duration (seconds) via ffmpeg -stream_loop. */
export function loopAudioToDuration(input: string, output: string, targetSec: number): string {
    const p = ff();
    if (!fs.existsSync(input)) return input;
    try {
        execFileSync(p, [
            '-y', '-stream_loop', '-1', '-i', input,
            '-t', String(targetSec), '-ac', '2', output,
        ], { stdio: 'ignore', timeout: 60000 });
    } catch (e: any) {
        console.warn(`  ⚠ loopAudioToDuration failed: ${String(e?.stderr ?? e?.message).slice(0, 200)}`);
        return input;
    }
    return fs.existsSync(output) && fs.statSync(output).size > 0 ? output : input;
}
