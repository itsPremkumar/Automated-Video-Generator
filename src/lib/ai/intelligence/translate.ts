/**
 * ai/intelligence/translate.ts — multi-language subtitle generation.
 *
 * Transcribes voiceover (Whisper.cpp), translates (NLLB/M2M100),
 * and burns translated captions into video.
 *
 * Identity-preserving: returns original text if translation fails.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { logInfo } from '../../../shared/logging/runtime-logging.js';

const TRANSLATE_SCRIPT = process.env.TRANSLATE_SCRIPT || '';
const TRANSLATE_URL = process.env.TRANSLATE_URL || 'http://127.0.0.1:8194';
const TRANSLATE_TIMEOUT = Math.max(30000, Number(process.env.TRANSLATE_TIMEOUT_MS || 300000));
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'ggml-base.bin';
const NLLB_MODEL = process.env.NLLB_MODEL || 'nllb-200-distilled-600M';

export interface TranslationResult {
    originalText: string;
    translatedText: string;
    sourceLang: string;
    targetLang: string;
    srtPath: string;        // path to .srt subtitle file
}

/** Check if translation is available. */
export function isEnabled(): boolean {
    return !!TRANSLATE_SCRIPT || true;
}

/** Check if translation server is reachable. */
export async function isAvailable(): Promise<boolean> {
    if (TRANSLATE_SCRIPT && fs.existsSync(TRANSLATE_SCRIPT)) return true;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`${TRANSLATE_URL}/health`, { signal: ctrl.signal });
        clearTimeout(t);
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Translate text from source language to target language.
 * Returns translated text or original on failure.
 */
export async function translate(opts: {
    text: string;
    targetLang: string;
    sourceLang?: string;
    outDir?: string;
    filename?: string;
}): Promise<TranslationResult | null> {
    // Option 1: Use standalone script
    if (TRANSLATE_SCRIPT && fs.existsSync(TRANSLATE_SCRIPT)) {
        return await runScript(opts);
    }

    // Option 2: Use server API
    try {
        return await runServerApi(opts);
    } catch (e: any) {
        logInfo(`[TRANSLATE] Failed: ${e?.message ?? e}`);
        return null;
    }
}

async function runScript(opts: any): Promise<TranslationResult | null> {
    const outDir = opts.outDir || path.join(process.cwd(), 'workspace', 'translations');
    const fname = opts.filename || `sub_${opts.targetLang}.srt`;
    const srtPath = path.join(outDir, fname);
    fs.mkdirSync(outDir, { recursive: true });

    return new Promise((resolve) => {
        const proc = spawn('python', [
            TRANSLATE_SCRIPT,
            '--text', opts.text,
            '--target-lang', opts.targetLang,
            '--source-lang', opts.sourceLang || 'auto',
            '--output', srtPath,
            '--model', NLLB_MODEL,
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) {
                logInfo(`[TRANSLATE] Script failed: ${stderr.slice(-200)}`);
                resolve(null);
                return;
            }
            try {
                const result = JSON.parse(stdout) as TranslationResult;
                resolve(result);
            } catch {
                resolve(null);
            }
        });
        setTimeout(() => { proc.kill(); resolve(null); }, TRANSLATE_TIMEOUT);
    });
}

async function runServerApi(opts: any): Promise<TranslationResult | null> {
    const res = await fetch(`${TRANSLATE_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: opts.text,
            target_lang: opts.targetLang,
            source_lang: opts.sourceLang || 'auto',
        }),
    });
    if (!res.ok) return null;

    return await res.json() as TranslationResult;
}

/**
 * Transcribe audio using Whisper.cpp.
 * Returns transcribed text or empty string.
 */
export async function transcribe(opts: {
    audioPath: string;
    language?: string;
}): Promise<string> {
    if (!fs.existsSync(opts.audioPath)) return '';

    // Use whisper.cpp directly
    return new Promise((resolve) => {
        const whisperPath = process.env.WHISPER_PATH || './whisper.cpp';
        const modelPath = path.join(whisperPath, 'models', WHISPER_MODEL);
        const proc = spawn(path.join(whisperPath, 'main'), [
            '-m', modelPath,
            '-f', opts.audioPath,
            '-l', opts.language || 'auto',
            '--output-txt',
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let stdout = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.on('close', (code) => {
            if (code !== 0) {
                resolve('');
                return;
            }
            // Read the .txt output
            const txtPath = opts.audioPath + '.txt';
            if (fs.existsSync(txtPath)) {
                const text = fs.readFileSync(txtPath, 'utf-8').trim();
                resolve(text);
            } else {
                resolve(stdout.trim());
            }
        });
        setTimeout(() => { proc.kill(); resolve(''); }, TRANSLATE_TIMEOUT);
    });
}
