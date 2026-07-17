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
import { Plan, ScenePlan } from './types.js';
import { AgenticWorkspace } from './workspace.js';
import { CaptionSegment, writeCaptionSidecars } from '../lib/captions.js';

 
const ffmpeg: string = require('ffmpeg-static');
const { execFileSync } = require('child_process');
const os = require('os');

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
    const p = `${os.tmpdir()}/agentic_vo_${Date.now()}_${idx}_${Math.random().toString(36).slice(2)}.wav`;
    const dur = Math.max(1.5, durationSec);
    // A soft 220Hz tone, quiet, so the video has an audio track offline.
    execFileSync(ffmpeg, [
        '-f', 'lavfi', '-i', `sine=frequency=220:duration=${dur}`,
        '-af', 'volume=0.15', '-c:a', 'pcm_s16le', '-y', p,
    ], { stdio: 'ignore' });
    return { audioPath: p, durationSec: dur };
}

/** Build the Scene[] shape generateVoiceovers expects from our plan. */
function toEngineScenes(plan: Plan): { sceneNumber: number; voiceoverText: string; duration?: number }[] {
    return plan.scenes.map((s) => ({
        sceneNumber: s.sceneNumber,
        voiceoverText: s.voiceoverText,
        duration: s.durationSec,
    })) as any;
}

export async function generateAgenticVoiceovers(
    plan: Plan,
    ws: AgenticWorkspace,
    voice?: string,
): Promise<VoiceoverResult> {
    const audioDir = path.join(ws.root, 'audio');
    fs.mkdirSync(audioDir, { recursive: true });

    // ── Try the real Edge-TTS engine (or Kokoro/etc. fallback chain). ──
    // Hard wall-clock timeout: node-edge-tts has no internal timeout, so an
    // unreachable network would hang the whole render forever. Bound it and
    // fall back to tones if voice generation can't finish in time.
    try {
        const { generateVoiceovers } = await import('../lib/voice-generator.js');
        const map = await withTimeout(
            generateVoiceovers(toEngineScenes(plan) as any, audioDir, {
                voice: voice ?? plan.voice,
            } as any),
            25_000,
            'voice generation timed out (network/Edge-TTS unreachable)',
        );
        const scenes: SceneVoiceover[] = [];
        let ok = 0;
        for (const s of plan.scenes) {
            const r: any = map.get(s.sceneNumber);
            if (r?.path && fs.existsSync(r.path)) {
                scenes.push({
                    sceneIndex: s.sceneNumber - 1,
                    audioPath: r.path,
                    durationSec: r.duration || s.durationSec,
                    captionSegments: (r.captionSegments?.length)
                        ? r.captionSegments
                        : [{ text: s.voiceoverText, startMs: 0, endMs: Math.round((r.duration || s.durationSec) * 1000) }],
                });
                ok++;
            }
        }
        if (ok === plan.scenes.length) {
            const sidecars = writeCaptionSidecars(audioDir, toCaptionScenes(plan, scenes), { baseName: 'subtitles' });
            return { scenes, voiceoverDriven: true, sidecars, fallbackUsed: false };
        }
        // Partial success: fill missing scenes with tones (don't fail the job).
        return fillMissing(plan, scenes, audioDir, /*driven*/ ok > 0);
    } catch (e: any) {
        // Engine not available / threw / timed out -> agent fallback to tones (still a real video).
        console.warn(`⚠ voice engine unavailable ("${e?.message}"); using agent tone fallback.`);
        return fillMissing(plan, [], audioDir, false);
    }
}

/** Reject if `promise` doesn't settle within `ms`. Never hangs the render. */
function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(msg)), ms);
        promise.then(
            (v) => { clearTimeout(t); resolve(v); },
            (e) => { clearTimeout(t); reject(e); },
        );
    });
}

function fillMissing(plan: Plan, have: SceneVoiceover[], audioDir: string, driven: boolean): VoiceoverResult {
    const byIdx = new Map(have.map((h) => [h.sceneIndex, h]));
    const scenes: SceneVoiceover[] = [];
    for (const s of plan.scenes) {
        const idx = s.sceneNumber - 1;
        const existing = byIdx.get(idx);
        if (existing) { scenes.push(existing); continue; }
        const t = toneForScene(s.voiceoverText, s.durationSec, idx);
        // Sentence-length caption fallback from the scene text.
        const caps: CaptionSegment[] = [{
            text: s.voiceoverText,
            startMs: 0,
            endMs: Math.round(t.durationSec * 1000),
        }];
        scenes.push({ sceneIndex: idx, audioPath: t.audioPath, durationSec: t.durationSec, captionSegments: caps });
    }
    const sidecars = writeCaptionSidecars(audioDir, toCaptionScenes(plan, scenes), { baseName: 'subtitles' });
    return { scenes, voiceoverDriven: driven, sidecars, fallbackUsed: !driven };
}

/** Map plan + generated voiceovers into CaptionSourceScene[] for sidecars. */
function toCaptionScenes(plan: Plan, scenes: SceneVoiceover[]): { text: string; durationSeconds: number; captionSegments?: CaptionSegment[] }[] {
    const byIdx = new Map(scenes.map((s) => [s.sceneIndex, s]));
    return plan.scenes.map((s) => {
        const v = byIdx.get(s.sceneNumber - 1);
        return {
            text: s.voiceoverText,
            durationSeconds: v?.durationSec ?? s.durationSec,
            captionSegments: v?.captionSegments?.length ? v.captionSegments : undefined,
        };
    });
}
