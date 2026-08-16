/**
 * captions/audition.ts — Voice audition service.
 *
 * Preview voices before generating the full video.
 * Identity-preserving: uses existing TTS infrastructure.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../../shared/logging/runtime-logging.js';

const PREVIEW_DIR = path.resolve(process.cwd(), 'workspace', 'tts-preview');

/** Generate a voice preview for audition */
export async function generateVoicePreview(
    provider: string,
    voice: string,
    text?: string,
): Promise<string> {
    const previewText = text || 'Hello! This is a voice preview. I hope you like this voice for your video.';
    const outPath = path.join(PREVIEW_DIR, `audition-${provider}-${voice}-${Date.now()}.mp3`);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    try {
        switch (provider) {
            case 'elevenlabs': {
                const { previewVoice } = await import('../tts/elevenlabs.js');
                return previewVoice(voice);
            }
            case 'siliconflow': {
                const { previewVoice } = await import('../tts/siliconflow.js');
                return previewVoice(voice);
            }
            case 'edge-tts':
            default: {
                const { runEdgeTts } = await import('../../../lib/voice-engine.js');
                runEdgeTts(['--voice', voice, '--text', previewText, '--write-media', outPath]);
                return outPath;
            }
        }
    } catch (e: any) {
        logWarn(`[AUDITION] Failed: ${e?.message ?? e}`);
        throw e;
    }
}

/** Get all available voices for audition */
export function getAllVoicesForAudition(): Record<string, string[]> {
    return {
        'edge-tts': [
            'en-US-GuyNeural', 'en-US-JennyNeural', 'en-US-AriaNeural',
            'en-GB-RyanNeural', 'en-GB-SoniaNeural', 'en-IN-PrabhatNeural',
            'en-AU-NatashaNeural', 'en-CA-ClaraNeural',
        ],
        'elevenlabs': ['21m00Tcm4TlvDq8ikWAM'], // Rachel (default)
        'siliconflow': ['alex', 'anna', 'bella', 'andy', 'chris', 'diana', 'eric'],
    };
}

/** Clean up old preview files */
export function cleanupPreviews(maxAgeMs: number = 3600000): void {
    try {
        if (!fs.existsSync(PREVIEW_DIR)) return;
        const files = fs.readdirSync(PREVIEW_DIR);
        const now = Date.now();
        for (const file of files) {
            const filePath = path.join(PREVIEW_DIR, file);
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > maxAgeMs) {
                fs.unlinkSync(filePath);
            }
        }
        logInfo(`[AUDITION] Cleaned up old previews`);
    } catch (e: any) {
        logWarn(`[AUDITION] Cleanup failed: ${e?.message ?? e}`);
    }
}
