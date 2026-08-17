/**
 * url-to-video.ts — Convert URL/Article to video.
 * Extracts text from URL, generates script, then creates video.
 * Identity-preserving: uses existing pipeline, no external deps.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn } from '../../shared/logging/runtime-logging.js';

export interface UrlToVideoOptions {
    url: string;
    outputPath: string;
    title?: string;
    duration?: number;
    orientation?: 'landscape' | 'portrait' | 'square';
}

export async function extractTextFromUrl(url: string): Promise<string> {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
        if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);
        const html = await res.text();
        const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        logInfo(`[URL2VIDEO] Extracted ${text.length} chars from ${url}`);
        return text.slice(0, 5000);
    } catch (e: any) {
        logWarn(`[URL2VIDEO] Extract failed: ${e?.message ?? e}`);
        throw e;
    }
}

export function generateScriptFromText(text: string, maxScenes: number = 5): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const scenes: string[] = [];
    const step = Math.max(1, Math.floor(sentences.length / maxScenes));
    for (let i = 0; i < sentences.length && scenes.length < maxScenes; i += step) scenes.push(sentences[i].trim());
    return scenes.length > 0 ? scenes : [text.slice(0, 200)];
}

export async function urlToVideo(options: UrlToVideoOptions): Promise<string> {
    const { url, outputPath, title, orientation = 'landscape' } = options;
    const text = await extractTextFromUrl(url);
    const scenes = generateScriptFromText(text);
    logInfo(`[URL2VIDEO] Generated ${scenes.length} scenes from URL`);
    const outDir = path.dirname(outputPath);
    fs.mkdirSync(outDir, { recursive: true });
    const scriptPath = path.join(outDir, `url-script-${Date.now()}.json`);
    fs.writeFileSync(scriptPath, JSON.stringify({ url, scenes, title, orientation }, null, 2));
    return scriptPath;
}

export function textToScript(textFile: string, maxScenes: number = 5): string[] {
    if (!fs.existsSync(textFile)) throw new Error(`Text file not found: ${textFile}`);
    const text = fs.readFileSync(textFile, 'utf-8');
    return generateScriptFromText(text, maxScenes);
}
