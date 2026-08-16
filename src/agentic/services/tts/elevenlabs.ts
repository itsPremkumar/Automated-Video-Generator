/**
 * elevenlabs.ts — ElevenLabs text-to-speech provider.
 *
 * High-quality AI voice synthesis with voice cloning support.
 * Identity-preserving: OFF by default, enabled via ELEVENLABS_API_KEY.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../../shared/logging/runtime-logging.js';

export interface ElevenLabsVoice {
    voice_id: string;
    name: string;
    category?: 'premade' | 'cloned' | 'generated';
    description?: string;
    labels?: Record<string, string>;
}

export interface ElevenLabsOptions {
    voice_id?: string;
    model?: string;
    stability?: number;
    similarity_boost?: number;
    style?: number;
    speaker_boost?: boolean;
}

const API_BASE = 'https://api.elevenlabs.io/v1';
const DEFAULT_MODEL = 'eleven_multilingual_v2';
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel

/** Check if ElevenLabs is configured */
export function isElevenLabsConfigured(): boolean {
    return !!process.env.ELEVENLABS_API_KEY;
}

/** Get API key from env */
function getApiKey(): string {
    return process.env.ELEVENLABS_API_KEY || '';
}

/** Get list of available voices */
export async function getVoices(): Promise<ElevenLabsVoice[]> {
    try {
        const res = await fetch(`${API_BASE}/voices`, {
            headers: { 'xi-api-key': getApiKey() },
        });

        if (!res.ok) {
            logWarn(`[ELEVENLABS] Failed to get voices: ${res.status}`);
            return [];
        }

        const json = await res.json();
        return (json.voices || []).map((v: any) => ({
            voice_id: v.voice_id,
            name: v.name,
            category: v.category,
            description: v.description,
            labels: v.labels,
        }));
    } catch (e: any) {
        logWarn(`[ELEVENLABS] getVoices error: ${e?.message ?? e}`);
        return [];
    }
}

/** Preview a voice (generate short sample) */
export async function previewVoice(voiceId: string = DEFAULT_VOICE): Promise<string> {
    try {
        const res = await fetch(`${API_BASE}/voices/${voiceId}/samples`, {
            headers: { 'xi-api-key': getApiKey() },
        });

        if (!res.ok) {
            throw new Error(`Failed to get voice sample: ${res.status}`);
        }

        const buffer = await res.arrayBuffer();
        const outDir = path.resolve(process.cwd(), 'workspace', 'tts-preview');
        fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, `elevenlabs-${voiceId}.mp3`);
        fs.writeFileSync(outPath, Buffer.from(buffer));
        return outPath;
    } catch (e: any) {
        logWarn(`[ELEVENLABS] previewVoice error: ${e?.message ?? e}`);
        throw e;
    }
}

/** Generate speech from text */
export async function synthesize(
    text: string,
    options: ElevenLabsOptions = {},
): Promise<string> {
    const voiceId = options.voice_id || DEFAULT_VOICE;
    const model = options.model || DEFAULT_MODEL;

    logInfo(`[ELEVENLABS] Synthesizing with voice ${voiceId}, model ${model}`);

    try {
        const res = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'xi-api-key': getApiKey(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text,
                model_id: model,
                voice_settings: {
                    stability: options.stability ?? 0.5,
                    similarity_boost: options.similarity_boost ?? 0.75,
                    style: options.style ?? 0.5,
                    use_speaker_boost: options.speaker_boost ?? true,
                },
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`ElevenLabs TTS failed: ${res.status} ${errText.slice(0, 200)}`);
        }

        const buffer = await res.arrayBuffer();
        const outDir = path.resolve(process.cwd(), 'workspace', 'tts-output');
        fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, `elevenlabs-${Date.now()}.mp3`);
        fs.writeFileSync(outPath, Buffer.from(buffer));

        logInfo(`[ELEVENLABS] Generated: ${outPath} (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
        return outPath;
    } catch (e: any) {
        logWarn(`[ELEVENLABS] synthesize error: ${e?.message ?? e}`);
        throw e;
    }
}

/** Get voice recommendations by category */
export async function getRecommendedVoices(): Promise<ElevenLabsVoice[]> {
    const voices = await getVoices();
    // Return premade voices sorted by name
    return voices
        .filter(v => v.category === 'premade')
        .sort((a, b) => a.name.localeCompare(b.name));
}
