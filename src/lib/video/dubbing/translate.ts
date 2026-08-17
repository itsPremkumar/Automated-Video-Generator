/**
 * dubbing/translate.ts — Video translation + dubbing.
 * Translates video audio to another language using Whisper + NLLB + TTS.
 * Identity-preserving: OFF by default, requires Whisper + TTS setup.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { logInfo, logWarn } from '../../../shared/logging/runtime-logging.js';

export interface TranslateOptions {
    inputPath: string;
    outputPath: string;
    sourceLang?: string;
    targetLang: string;
    ttsVoice?: string;
}

export async function transcribeAudio(audioPath: string, language?: string): Promise<{ text: string; segments: any[] }> {
    if (!fs.existsSync(audioPath)) throw new Error(`Audio not found: ${audioPath}`);
    const whisperCmd = language ? ['--language', language, '--output_format', 'json', audioPath] : ['--output_format', 'json', audioPath];
    return new Promise((resolve, reject) => {
        const proc = spawn('whisper', whisperCmd, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) { reject(new Error(`Transcription failed: ${code}`)); return; }
            try { const json = JSON.parse(stdout); resolve({ text: json.text || '', segments: json.segments || [] }); } catch { resolve({ text: stdout, segments: [] }); }
        });
    });
}

export async function translateText(text: string, targetLang: string, sourceLang?: string): Promise<string> {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const model = process.env.NLLB_MODEL || 'nllb-200-distilled-600M';
    try {
        const res = await fetch(`${ollamaUrl}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt: `Translate to ${targetLang}: ${text}`, stream: false }) });
        if (!res.ok) return text;
        const json = await res.json();
        return json.response || text;
    } catch { return text; }
}

export async function extractAudio(videoPath: string, outputPath: string): Promise<string> {
    if (!fs.existsSync(videoPath)) throw new Error(`Video not found: ${videoPath}`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', ['-i', videoPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', '-y', outputPath], { stdio: ['ignore', 'pipe', 'pipe'] });
        proc.on('close', (code) => { if (code !== 0) reject(new Error(`Audio extraction failed: ${code}`)); else resolve(outputPath); });
    });
}

export async function replaceAudio(videoPath: string, audioPath: string, outputPath: string): Promise<string> {
    if (!fs.existsSync(videoPath) || !fs.existsSync(audioPath)) throw new Error('Video or audio not found');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', ['-i', videoPath, '-i', audioPath, '-c:v', 'copy', '-map', '0:v:0', '-map', '1:a:0', '-shortest', '-y', outputPath], { stdio: ['ignore', 'pipe', 'pipe'] });
        proc.on('close', (code) => { if (code !== 0) reject(new Error(`Audio replacement failed: ${code}`)); else resolve(outputPath); });
    });
}
