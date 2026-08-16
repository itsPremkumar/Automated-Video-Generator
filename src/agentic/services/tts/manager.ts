/**
 * tts-manager.ts — Unified TTS provider manager.
 *
 * Manages multiple TTS providers (Edge-TTS, ElevenLabs, SiliconFlow, etc.)
 * with fallback chain and voice preview support.
 *
 * Identity-preserving: uses Edge-TTS by default, others opt-in via env.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../../shared/logging/runtime-logging.js';
import { isElevenLabsConfigured, synthesize as elevenlabsSynthesize, previewVoice as elevenlabsPreview } from './elevenlabs.js';
import { isSiliconFlowConfigured, synthesize as siliconflowSynthesize, previewVoice as siliconflowPreview } from './siliconflow.js';

export type TtsProvider = 'edge-tts' | 'elevenlabs' | 'siliconflow';

export interface TtsOptions {
    text: string;
    voice?: string;
    language?: string;
    speed?: number;
    outputPath?: string;
    provider?: TtsProvider;
}

export interface TtsResult {
    outputPath: string;
    provider: TtsProvider;
    duration?: number;
}

/** Get configured TTS provider */
export function getTtsProvider(): TtsProvider {
    return (process.env.TTS_PROVIDER as TtsProvider) || 'edge-tts';
}

/** Check if a provider is available */
export function isProviderAvailable(provider: TtsProvider): boolean {
    switch (provider) {
        case 'elevenlabs':
            return isElevenLabsConfigured();
        case 'siliconflow':
            return isSiliconFlowConfigured();
        case 'edge-tts':
        default:
            return true; // Always available
    }
}

/** Get list of available providers */
export function getAvailableProviders(): TtsProvider[] {
    const providers: TtsProvider[] = ['edge-tts'];
    if (isElevenLabsConfigured()) providers.push('elevenlabs');
    if (isSiliconFlowConfigured()) providers.push('siliconflow');
    return providers;
}

/** Synthesize speech with specified or default provider */
export async function synthesize(options: TtsOptions): Promise<TtsResult> {
    const provider = options.provider || getTtsProvider();

    // Fallback chain: requested → edge-tts
    let actualProvider = provider;
    if (!isProviderAvailable(provider)) {
        logWarn(`[TTS] Provider ${provider} not available, falling back to edge-tts`);
        actualProvider = 'edge-tts';
    }

    logInfo(`[TTS] Synthesizing with ${actualProvider}: ${options.text.slice(0, 50)}...`);

    switch (actualProvider) {
        case 'elevenlabs': {
            const outputPath = options.outputPath || path.join(process.cwd(), 'workspace', 'tts-output', `elevenlabs-${Date.now()}.mp3`);
            const result = await elevenlabsSynthesize(options.text, { voice_id: options.voice });
            return { outputPath: result, provider: 'elevenlabs' };
        }
        case 'siliconflow': {
            const outputPath = options.outputPath || path.join(process.cwd(), 'workspace', 'tts-output', `siliconflow-${Date.now()}.mp3`);
            const result = await siliconflowSynthesize(options.text, { voice: options.voice });
            return { outputPath: result, provider: 'siliconflow' };
        }
        case 'edge-tts':
        default: {
            // Use existing edge-tts integration via voice-engine.ts
            const { runEdgeTts } = await import('../../../lib/voice-engine.js');
            const outputPath = options.outputPath || path.join(process.cwd(), 'workspace', 'tts-output', `edge-${Date.now()}.mp3`);
            const voice = options.voice || 'en-US-GuyNeural';
            const rate = options.speed ? `${options.speed > 1 ? '+' : ''}${Math.round((options.speed - 1) * 100)}%` : '+0%';
            
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            
            const result = runEdgeTts([
                '--voice', voice,
                '--text', options.text,
                '--write-media', outputPath,
                '--rate', rate,
            ]);
            
            return { outputPath, provider: 'edge-tts' };
        }
    }
}

/** Preview a voice (short sample) */
export async function previewVoice(provider: TtsProvider, voice?: string): Promise<string> {
    switch (provider) {
        case 'elevenlabs':
            return elevenlabsPreview(voice);
        case 'siliconflow':
            return siliconflowPreview(voice);
        case 'edge-tts':
        default: {
            const { runEdgeTts } = await import('../../../lib/voice-engine.js');
            const outPath = path.join(process.cwd(), 'workspace', 'tts-preview', `preview-${Date.now()}.mp3`);
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            runEdgeTts([
                '--voice', voice || 'en-US-GuyNeural',
                '--text', 'Hello! This is a voice preview.',
                '--write-media', outPath,
            ]);
            return outPath;
        }
    }
}

/** Get voice list for a provider */
export function getVoices(provider: TtsProvider): string[] {
    switch (provider) {
        case 'elevenlabs':
            return []; // Async, use getVoicesAsync
        case 'siliconflow':
            return ['alex', 'anna', 'bella', 'andy', 'chris', 'diana', 'eric'];
        case 'edge-tts':
        default:
            return [
                'en-US-GuyNeural', 'en-US-JennyNeural', 'en-US-AriaNeural',
                'en-GB-RyanNeural', 'en-GB-SoniaNeural', 'en-IN-PrabhatNeural',
            ];
    }
}
