/**
 * voice/clone.ts — Voice cloning using XTTS-v2 (Coqui TTS).
 *
 * Clone a voice from a reference audio file.
 * Identity-preserving: OFF by default, requires COQUI_API_URL or local install.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { logInfo, logWarn } from '../../../shared/logging/runtime-logging.js';

export interface VoiceCloneOptions {
    referenceAudio: string;
    text: string;
    outputPath: string;
    language?: string;
}

const COQUI_DEFAULT_URL = 'http://localhost:8080';

export function isCoquiAvailable(): boolean {
    return !!process.env.COQUI_API_URL || !!process.env.COQUI_LOCAL_PATH;
}

export async function cloneVoice(options: VoiceCloneOptions): Promise<string> {
    const { referenceAudio, text, outputPath, language = 'en' } = options;
    if (!fs.existsSync(referenceAudio)) throw new Error(`Reference audio not found: ${referenceAudio}`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const coquiUrl = process.env.COQUI_API_URL || COQUI_DEFAULT_URL;
    const formData = new FormData();
    formData.append('text', text);
    formData.append('language', language);
    formData.append('speaker_wav', new Blob([fs.readFileSync(referenceAudio)]), 'reference.wav');

    const res = await fetch(`${coquiUrl}/api/tts`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`Coqui API error: ${res.status}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(buffer));
    return outputPath;
}

export async function cloneVoiceLocal(options: VoiceCloneOptions): Promise<string> {
    const { referenceAudio, text, outputPath, language = 'en' } = options;
    if (!fs.existsSync(referenceAudio)) throw new Error(`Reference audio not found: ${referenceAudio}`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    return new Promise((resolve, reject) => {
        const proc = spawn('tts', ['--text', text, '--speaker_wav', referenceAudio, '--language_idx', language, '--out_path', outputPath], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) { reject(new Error(`Voice clone failed: ${code}`)); return; }
            resolve(outputPath);
        });
    });
}

export function getVoiceCloneModels(): string[] {
    return ['tts_models/multilingual/multi-dataset/xtts_v2', 'tts_models/en/ljspeech/tacotron2-DDC', 'tts_models/en/ljspeech/glow-tts'];
}
