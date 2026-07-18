/**
 * audio-track.ts — add a music or audio track to an EXISTING video (single task).
 *
 * Reuses the project's resolveFreeBackgroundMusic (free CC tracks, zero-cost) and
 * applyAutoDucking so voice (if any) stays audible under music. When no music
 * query resolves, falls back to silent (still muxes the original video audio).
 */

import * as fs from 'fs';
import * as path from 'path';
import { runFfmpeg } from './edit.js';
import { resolveFreeBackgroundMusic } from '../../lib/free-music.js';
import { applyAutoDucking } from '../../lib/audio-processor.js';

export interface AudioTrackResult { ok: boolean; output?: string; detail: string; usedMusic: boolean; }

/** Add a free background music track under a video. */
export async function addMusic(file: string, query = 'ambient lofi', out?: string): Promise<AudioTrackResult> {
    if (!fs.existsSync(file)) return { ok: false, output: undefined, detail: `video not found: ${file}`, usedMusic: false };
    const output = out ?? path.join(process.cwd(), 'output', `with_music_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });

    let musicPath = '';
    try {
        const m = await resolveFreeBackgroundMusic({ query, enabled: true });
        musicPath = m?.localPath && fs.existsSync(m.localPath) ? m.localPath : '';
    } catch {
        musicPath = '';
    }
    if (!musicPath) {
        const fallback = ['./input/music/twenty_minutes.mp3', './input/music/two_minutes.mp3'].find((p) => fs.existsSync(p));
        musicPath = fallback ?? '';
    }

    if (!musicPath) {
        // No music available: just pass the video through (keeps original audio).
        const { code } = await runFfmpeg(['-i', file, '-c', 'copy', '-y', output]);
        return { ok: code === 0 && fs.existsSync(output), output: code === 0 ? output : undefined, detail: 'no free music found; passed video through unchanged', usedMusic: false };
    }

    // Duck the music under any voice in the video, then mux.
    const ducked = await applyAutoDucking(musicPath, [file], path.dirname(output)).catch(() => musicPath);
    const { code, out: log } = await runFfmpeg([
        '-i', file, '-i', ducked,
        '-filter_complex', '[1:a]volume=0.35[a]', '-map', '0:v', '-map', '[a]',
        '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-y', output,
    ]);
    if (code !== 0) return { ok: false, output: undefined, detail: `mux failed:\n${log.slice(-600)}`, usedMusic: false };
    if (!fs.existsSync(output)) return { ok: false, output: undefined, detail: 'output not produced', usedMusic: false };
    return { ok: true, output, detail: `added music (${query}) under ${file}`, usedMusic: true };
}

/** Mux a user-supplied audio file (voiceover/narration) onto a video. */
export async function addAudioTrack(file: string, audioFile: string, out?: string, audioVolume = 1.0): Promise<AudioTrackResult> {
    if (!fs.existsSync(file)) return { ok: false, output: undefined, detail: `video not found: ${file}`, usedMusic: false };
    if (!fs.existsSync(audioFile)) return { ok: false, output: undefined, detail: `audio not found: ${audioFile}`, usedMusic: false };
    const output = out ?? path.join(process.cwd(), 'output', `with_audio_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const { code, out: log } = await runFfmpeg([
        '-i', file, '-i', audioFile,
        '-filter_complex', `[1:a]volume=${audioVolume}[a]`, '-map', '0:v', '-map', '[a]',
        '-c:v', 'copy', '-c:a', 'aac', '-shortest', '-y', output,
    ]);
    if (code !== 0) return { ok: false, output: undefined, detail: `mux failed:\n${log.slice(-600)}`, usedMusic: false };
    if (!fs.existsSync(output)) return { ok: false, output: undefined, detail: 'output not produced', usedMusic: false };
    return { ok: true, output, detail: `muxed ${audioFile} onto ${file}`, usedMusic: false };
}
