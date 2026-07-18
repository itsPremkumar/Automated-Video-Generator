/**
 * voiceover.ts — standalone "generate voiceover ONLY" operation.
 *
 * Reuses the project's REAL Edge-TTS engine (generateVoiceovers) so a user can
 * say "make me a voiceover of this text" and get back just the mp3 — no video,
 * no full pipeline. Falls back to a soft tone if the Edge-TTS binary is offline
 * (same resilience rule as the agentic pipeline: never crash, never hang).
 *
 * ZERO-COST: Edge-TTS is free; no API key required.
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateVoiceovers } from '../../lib/voice-generator.js';
import { withRetry } from './retry.js';

export interface VoiceoverResult {
    ok: boolean;
    /** Path to the produced mp3 (single combined file when multiple lines). */
    output?: string;
    /** True when real TTS was used; false when the agent used a tone fallback. */
    voiceoverDriven: boolean;
    detail: string;
    clips: { index: number; text: string; path: string; durationSec: number }[];
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(msg)), ms);
        p.then(
            (v) => {
                clearTimeout(t);
                resolve(v);
            },
            (e) => {
                clearTimeout(t);
                reject(e);
            },
        );
    });
}

/** Make a soft fallback tone (offline) so we still return a real audio file. */
function toneFor(text: string, idx: number, dir: string): { path: string; durationSec: number } {
    const ffmpeg: string = (() => {
        try {
            return require('ffmpeg-static');
        } catch {
            return 'ffmpeg';
        }
    })();
    const os = require('os');
    const p = path.join(dir, `vo_${idx}.wav`);
    const dur = Math.max(1.5, text.split(/\s+/).length * 0.4);
    try {
        require('child_process').execFileSync(ffmpeg, [
            '-f',
            'lavfi',
            '-i',
            `sine=frequency=220:duration=${dur}`,
            '-af',
            'volume=0.15',
            '-c:a',
            'pcm_s16le',
            '-y',
            p,
        ], { stdio: 'ignore' });
    } catch {
        /* best-effort */
    }
    return { path: p, durationSec: dur };
}

/**
 * Generate a voiceover from one or more text lines.
 * @param lines array of sentences/paragraphs to speak
 * @param voice Edge-TTS voice id (e.g. en-US-AriaNeural)
 * @param out optional output mp3 path (combined). When multiple lines, clips are
 *             also preserved individually under the same dir.
 */
export async function generateVoiceoverOnly(
    lines: string[],
    voice = 'en-US-AriaNeural',
    out?: string,
): Promise<VoiceoverResult> {
    const dir = out ? path.dirname(out) : path.join(process.cwd(), 'output', `voiceover_${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    const target = out ?? path.join(dir, 'voiceover.mp3');

    const scenes = lines.map((text, i) => ({ sceneNumber: i + 1, voiceoverText: text })) as any;
    try {
        const map = await withTimeout(
            withRetry(
                () => generateVoiceovers(scenes, dir, { voice } as any),
                { retries: 3, baseMs: 800, label: 'voiceover' },
            ),
            90_000,
            'voice generation timed out (Edge-TTS unreachable)',
        );
        const clips: VoiceoverResult['clips'] = [];
        let ok = 0;
        for (const s of scenes) {
            const r: any = map.get(s.sceneNumber);
            if (r?.path && fs.existsSync(r.path)) {
                clips.push({ index: s.sceneNumber, text: s.voiceoverText, path: r.path, durationSec: r.duration || 0 });
                ok++;
            }
        }
        const voiceoverDriven = ok === scenes.length;
        if (clips.length > 0) {
            // Combine all clips into the target mp3 (concat via ffmpeg filter).
            const ffmpeg: string = (() => {
                try {
                    return require('ffmpeg-static');
                } catch {
                    return 'ffmpeg';
                }
            })();
            const list = path.join(dir, 'vo_list.txt');
            fs.writeFileSync(list, clips.map((c) => `file '${path.resolve(c.path).replace(/'/g, "'\\''")}'`).join('\n'));
            try {
                require('child_process').execFileSync(ffmpeg, ['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-y', target], {
                    stdio: 'ignore',
                });
            } catch {
                // If concat fails, just copy the first clip as the output.
                if (clips[0]?.path) fs.copyFileSync(clips[0].path, target);
            }
            return {
                ok: true,
                output: fs.existsSync(target) ? target : clips[0]?.path,
                voiceoverDriven,
                detail: voiceoverDriven
                    ? `voiceover ready (${clips.length} clip(s)) -> ${target}`
                    : `voiceover partial: ${ok}/${scenes.length} clips via TTS, rest tone fallback -> ${target}`,
                clips,
            };
        }
    } catch (e: any) {
        console.warn(`⚠ voice engine unavailable ("${e?.message}"); tone fallback.`);
    }
    // Offline fallback: soft tone per line.
    const clips: VoiceoverResult['clips'] = [];
    for (const s of scenes) {
        const t = toneFor(s.voiceoverText, s.sceneNumber, dir);
        clips.push({ index: s.sceneNumber, text: s.voiceoverText, path: t.path, durationSec: t.durationSec });
    }
    return {
        ok: true,
        output: clips[0]?.path,
        voiceoverDriven: false,
        detail: `voice engine offline — returned tone fallback(s) -> ${clips[0]?.path ?? ''}`,
        clips,
    };
}
