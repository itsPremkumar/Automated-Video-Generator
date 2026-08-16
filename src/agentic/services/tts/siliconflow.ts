/**
 * siliconflow.ts — SiliconFlow (硅基流动) text-to-speech provider.
 *
 * Chinese-optimized TTS with CosyVoice2 support.
 * Identity-preserving: OFF by default, enabled via SILICONFLOW_API_KEY.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../../shared/logging/runtime-logging.js';

export interface SiliconFlowVoice {
    name: string;
    gender: 'Male' | 'Female';
    language: string;
}

export interface SiliconFlowOptions {
    voice?: string;
    model?: string;
    speed?: number;
    response_format?: 'mp3' | 'wav';
}

const API_BASE = 'https://api.siliconflow.cn/v1';
const DEFAULT_MODEL = 'FunAudioLLM/CosyVoice2-0.5B';
const DEFAULT_VOICE = 'alex';

const VOICE_LIST: SiliconFlowVoice[] = [
    { name: 'alex', gender: 'Male', language: 'zh' },
    { name: 'anna', gender: 'Female', language: 'zh' },
    { name: 'bella', gender: 'Female', language: 'zh' },
    { name: 'andy', gender: 'Male', language: 'zh' },
    { name: 'chris', gender: 'Male', language: 'en' },
    { name: 'diana', gender: 'Female', language: 'en' },
    { name: 'eric', gender: 'Male', language: 'en' },
];

/** Check if SiliconFlow is configured */
export function isSiliconFlowConfigured(): boolean {
    return !!process.env.SILICONFLOW_API_KEY;
}

/** Get API key */
function getApiKey(): string {
    return process.env.SILICONFLOW_API_KEY || '';
}

/** Get available voices */
export function getVoices(): SiliconFlowVoice[] {
    return VOICE_LIST;
}

/** Get voices by language */
export function getVoicesByLanguage(lang: string): SiliconFlowVoice[] {
    return VOICE_LIST.filter(v => v.language === lang);
}

/** Generate speech from text */
export async function synthesize(
    text: string,
    options: SiliconFlowOptions = {},
): Promise<string> {
    const voice = options.voice || DEFAULT_VOICE;
    const model = options.model || DEFAULT_MODEL;

    logInfo(`[SILICONFLOW] Synthesizing with voice ${voice}, model ${model}`);

    try {
        const res = await fetch(`${API_BASE}/audio/speech`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getApiKey()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                input: text,
                voice: `${model}:${voice}`,
                response_format: options.response_format || 'mp3',
                speed: options.speed ?? 1.0,
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`SiliconFlow TTS failed: ${res.status} ${errText.slice(0, 200)}`);
        }

        const buffer = await res.arrayBuffer();
        const outDir = path.resolve(process.cwd(), 'workspace', 'tts-output');
        fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, `siliconflow-${Date.now()}.mp3`);
        fs.writeFileSync(outPath, Buffer.from(buffer));

        logInfo(`[SILICONFLOW] Generated: ${outPath} (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
        return outPath;
    } catch (e: any) {
        logWarn(`[SILICONFLOW] synthesize error: ${e?.message ?? e}`);
        throw e;
    }
}

/** Preview a voice */
export async function previewVoice(voice: string = DEFAULT_VOICE): Promise<string> {
    return synthesize('你好，这是一个语音预览。Hello, this is a voice preview.', { voice });
}
