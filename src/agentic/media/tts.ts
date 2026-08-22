/**
 * tts.ts — PHASE 2: per-scene voiceover + PHASE 4.2 caption sidecars, wired
 * into the agentic pipeline.
 *
 * Reuses the project's real Edge-TTS engine (generateVoiceovers) so the final
 * video is genuinely *watchable* — spoken voiceover + word-timed captions.
 *
 * Resilience (backend='agent', zero external keys, possibly no Edge-TTS binary
 * in the environment): if the voice engine is unavailable the agent generates a
 * real sine-tone per scene (so the video still has an audio track + a
 * sentence-length caption fallback) and marks `voiceoverDriven=false`. The code
 * path is identical; only the audio source differs. No external AI is required.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Plan, ScenePlan } from '../types.js';
import { AgenticWorkspace } from '../management/workspace.js';
import { CaptionSegment, writeCaptionSidecars, syllableWordTimings } from '../../lib/captions.js';
import { resolveProjectPath } from '../../shared/runtime/paths.js';

const ffmpeg: string = require('ffmpeg-static');
const { execFileSync } = require('child_process');

// Voice-group budget: the Windows SAPI fallback can legitimately take ~10s+
// per scene (PowerShell + synthesis), so a 25s whole-group cap raced it and
// every scene silently degraded to a sine-tone placeholder. 120s covers a
// 7-scene SAPI batch; override with AVS_VOICE_GROUP_TIMEOUT_MS if needed.
const VOICE_GROUP_TIMEOUT_MS = Number(process.env.AVS_VOICE_GROUP_TIMEOUT_MS ?? 120_000);
// Real speech WAVs (44KB/s @22kHz mono) / MP3s are always > 16KB; the silent
// fallback (anullsrc) and broken files are far smaller. Used to distinguish
// genuine speech salvage candidates from junk.
const VOICE_FILE_MIN_BYTES = 16_384;

/** ffprobe duration of an audio file (seconds), or 0 when unreadable. */
function probeAudioDurationSec(file: string): number {
    try {
        const fp: string = require('ffprobe-static').path ?? require('ffprobe-static');
        const out = execFileSync(fp, ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', timeout: 15000 });
        const d = parseFloat(String(out).trim());
        return isNaN(d) || d <= 0 ? 0 : d;
    } catch { return 0; }
}

/**
 * Re-scan `audioDir` for real speech files (`scene_N_voice.wav/.mp3`) that a
 * voice-group timeout/cancel may have orphaned on disk, and return them as
 * usable voiceover entries. Prevents a group failure from degrading EVERY
 * scene to a sine-tone placeholder when speech was already synthesized.
 */
export function salvageVoiceFiles(
    audioDir: string,
    scenes: { sceneNumber: number; durationSec: number }[],
): Map<number, { path: string; duration: number; captionSegments: undefined }> {
    const out = new Map<number, { path: string; duration: number; captionSegments: undefined }>();
    for (const s of scenes) {
        for (const ext of ['wav', 'mp3']) {
            const cand = path.join(audioDir, `scene_${s.sceneNumber}_voice.${ext}`);
            if (!fs.existsSync(cand)) continue;
            try {
                if (fs.statSync(cand).size > VOICE_FILE_MIN_BYTES) {
                    out.set(s.sceneNumber, { path: cand, duration: probeAudioDurationSec(cand) || s.durationSec, captionSegments: undefined });
                    break;
                }
            } catch { /* unreadable file — try next */ }
        }
    }
    return out;
}

export interface SceneVoiceover {
    sceneIndex: number;
    audioPath: string;
    durationSec: number;
    captionSegments: CaptionSegment[];
}

export interface VoiceoverResult {
    scenes: SceneVoiceover[];
    /** True when real TTS was used; false when the agent fell back to tones. */
    voiceoverDriven: boolean;
    /** Sidecar caption files written (srt, vtt). */
    sidecars: string[];
    fallbackUsed: boolean;
}

function toneForScene(text: string, durationSec: number, idx: number): { audioPath: string; durationSec: number } {
    const toneDir = resolveProjectPath('workspace', 'tmp', 'tone-fallback');
    fs.mkdirSync(toneDir, { recursive: true });
    const p = `${toneDir}/vo_${Date.now()}_${idx}_${Math.random().toString(36).slice(2)}.wav`;
    const dur = Math.max(1.5, durationSec);
    // A soft 220Hz tone, quiet, so the video has an audio track offline.
    execFileSync(
        ffmpeg,
        ['-f', 'lavfi', '-i', `sine=frequency=220:duration=${dur}`, '-af', 'volume=0.15', '-c:a', 'pcm_s16le', '-y', p],
        { stdio: 'ignore' },
    );
    return { audioPath: p, durationSec: dur };
}

/** Build the Scene[] shape generateVoiceovers expects from our plan. */
// (toEngineScenes removed — per-scene voice batching is done inline)

export async function generateAgenticVoiceovers(
    plan: Plan,
    ws: AgenticWorkspace,
    voice?: string,
    useClonedVoiceId?: string,
): Promise<VoiceoverResult> {
    const root = ws.root;
    const audioDir = path.join(root, 'audio');
    fs.mkdirSync(audioDir, { recursive: true });
    const defaultVoice = voice ?? plan.voice;

    // PRIMARY: self-contained voicebox backend (in-repo kokoro/chatterbox).
    // Zero-config default; if it cannot come up we fall back below.
    // Build a full AgenticWorkspace so VoiceController's audioDir resolves.
    const backendWs: AgenticWorkspace = {
        ...ws,
        root,
        audioDir,
        assetsDir: ws.assetsDir ?? path.join(root, 'assets'),
        imagesDir: ws.imagesDir ?? path.join(root, 'assets', 'images'),
        verificationDir: ws.verificationDir ?? path.join(root, 'verification'),
    };
    try {
        const { runVoiceStageSafe } = await import('../media/voice-controller.js');
        const res = await runVoiceStageSafe(plan, backendWs, voice, undefined, useClonedVoiceId, plan.personas);
        if (res.voiceoverDriven || res.voices.length > 0) {
            const scenes: SceneVoiceover[] = res.voices.map((v) => ({
                sceneIndex: v.sceneIndex,
                audioPath: v.audioPath,
                durationSec: v.durationSec,
                captionSegments: syllableWordTimings(
                    plan.scenes[v.sceneIndex]?.voiceoverText ?? '',
                    Math.round((v.durationSec || 2) * 1000),
                ),
            }));
            const sidecars = writeCaptionSidecars(
                audioDir,
                toCaptionScenes(plan, scenes),
                { baseName: 'subtitles' },
            );
            return { scenes, voiceoverDriven: res.voiceoverDriven, sidecars, fallbackUsed: res.fallbackUsed };
        }
        console.warn('⚠ voicebox backend returned no voices; using Edge-TTS fallback');
    } catch (e: any) {
        console.warn(`⚠ voicebox backend unavailable ("${e?.message}"); using Edge-TTS fallback`);
    }

    // FALLBACK: Edge-TTS engine (or tones) — never blocks the render.
    try {
        const { generateVoiceovers } = await import('../../lib/voice-generator.js');
        const allResults = new Map<number, any>();

        // Group scenes by voice for batching
        const voiceGroups = new Map<string, typeof plan.scenes>();
        for (const s of plan.scenes) {
            const v = s.voiceOverride || defaultVoice;
            if (!voiceGroups.has(v)) voiceGroups.set(v, []);
            voiceGroups.get(v)!.push(s);
        }

        const errors: string[] = [];
        for (const [v, scenes] of voiceGroups) {
            const engineScenes = scenes.map((s) => ({
                sceneNumber: s.sceneNumber,
                voiceoverText: s.voiceoverText,
                duration: s.durationSec,
            }));
            try {
                const map = await withTimeout(
                    generateVoiceovers(engineScenes as any, audioDir, { voice: v } as any),
                    VOICE_GROUP_TIMEOUT_MS,
                    `voice generation timed out for "${v}"`,
                );
                for (const [k, val] of map) allResults.set(k, val);
            } catch (e: any) {
                errors.push(`${v}: ${e?.message}`);
                // SALVAGE (BUG FIX): the group promise rejection above discards
                // the whole batch, but scenes that ALREADY completed — e.g. the
                // Windows SAPI fallback writing scene_N_voice.wav — are real
                // speech sitting on disk. Without this re-scan EVERY scene
                // degrades to a sine-tone placeholder even though speech exists,
                // silently producing a video with NO spoken voiceover.
                for (const [sn, entry] of salvageVoiceFiles(audioDir, scenes)) allResults.set(sn, entry);
            }
        }

        const scenes: SceneVoiceover[] = [];
        let ok = 0;
        for (const s of plan.scenes) {
            const r: any = allResults.get(s.sceneNumber);
            if (r?.path && fs.existsSync(r.path)) {
                scenes.push({
                    sceneIndex: s.sceneNumber - 1,
                    audioPath: r.path,
                    durationSec: r.duration || s.durationSec,
                    captionSegments: r.captionSegments?.length
                        ? r.captionSegments
                        : syllableWordTimings(s.voiceoverText, Math.round((r.duration || s.durationSec) * 1000)),
                });
                ok++;
            }
        }
        if (errors.length > 0) console.warn(`⚠ voice group errors: ${errors.join('; ')}`);
        if (ok === plan.scenes.length) {
            const sidecars = writeCaptionSidecars(audioDir, toCaptionScenes(plan, scenes), { baseName: 'subtitles' });
            return { scenes, voiceoverDriven: true, sidecars, fallbackUsed: false };
        }
        return fillMissing(plan, scenes, audioDir, /*driven*/ ok > 0);
    } catch (e: any) {
        console.warn(`⚠ voice engine unavailable ("${e?.message}"); using agent tone fallback.`);
        return fillMissing(plan, [], audioDir, false);
    }
}

/** Reject if `promise` doesn't settle within `ms`. Never hangs the render. */
function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(msg)), ms);
        promise.then(
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

function fillMissing(plan: Plan, have: SceneVoiceover[], audioDir: string, driven: boolean): VoiceoverResult {
    const byIdx = new Map(have.map((h) => [h.sceneIndex, h]));
    const scenes: SceneVoiceover[] = [];
    for (const s of plan.scenes) {
        const idx = s.sceneNumber - 1;
        const existing = byIdx.get(idx);
        if (existing) {
            scenes.push(existing);
            continue;
        }
        const t = toneForScene(s.voiceoverText, s.durationSec, idx);
        // Word-paced caption fallback from the scene text (offline heuristic,
        // no network / native binary). Produces word-by-word cues instead of a
        // single all-at-once block so burned captions read naturally.
        const caps: CaptionSegment[] = syllableWordTimings(s.voiceoverText, Math.round(t.durationSec * 1000));
        scenes.push({ sceneIndex: idx, audioPath: t.audioPath, durationSec: t.durationSec, captionSegments: caps });
    }
    const sidecars = writeCaptionSidecars(audioDir, toCaptionScenes(plan, scenes), { baseName: 'subtitles' });
    return { scenes, voiceoverDriven: driven, sidecars, fallbackUsed: !driven };
}

/** Map plan + generated voiceovers into CaptionSourceScene[] for sidecars. */
function toCaptionScenes(
    plan: Plan,
    scenes: SceneVoiceover[],
): { text: string; durationSeconds: number; captionSegments?: CaptionSegment[] }[] {
    const byIdx = new Map(scenes.map((s) => [s.sceneIndex, s]));
    // Strip directive tags ([Visual: …] etc.) — scene-data round-trips can carry
    // the RAW script line, and sidecar subtitles must never show bracket syntax.
    const clean = (t: string | undefined) =>
        (t ?? '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    return plan.scenes.map((s) => {
        const v = byIdx.get(s.sceneNumber - 1);
        return {
            text: clean(s.voiceoverText),
            durationSeconds: v?.durationSec ?? s.durationSec,
            captionSegments: v?.captionSegments?.length ? v.captionSegments : undefined,
        };
    });
}
