import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import axios from 'axios';
import { generateContentWithImage as ollamaGenerateWithImage } from './ollama-client';
import { logInfo } from '../runtime';

const console = {
    log: (...args: unknown[]) => logInfo(...args),
};

const RAW_AI_PROVIDER_MV = process.env.AI_PROVIDER;
const AI_PROVIDER = RAW_AI_PROVIDER_MV !== undefined ? RAW_AI_PROVIDER_MV.trim().toLowerCase() || '' : 'ollama';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim() || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
const MEDIA_VERIFICATION_CONFIDENCE = Math.max(
    1,
    Math.min(10, Number.parseInt(process.env.MEDIA_VERIFICATION_CONFIDENCE || '6', 10) || 6),
);

export const MEDIA_VERIFICATION_ENABLED = process.env.MEDIA_VERIFICATION_ENABLED !== 'false';

function runFfmpeg(args: string[]): Buffer | null {
    try {
        const result = spawnSync('ffmpeg', args, { stdio: 'pipe', timeout: 15000 });
        if (result.status !== 0 || result.error) return null;
        return result.stdout;
    } catch {
        return null;
    }
}

export interface VerificationResult {
    passes: boolean;
    confidence: number;
    reason: string;
}

function extractVideoFrame(videoPath: string, outputDir: string): string | null {
    const framePath = path.join(outputDir, `verify_frame_${path.basename(videoPath)}.jpg`);
    if (fs.existsSync(framePath)) return framePath;
    try {
        runFfmpeg(['-y', '-i', videoPath, '-vframes', '1', '-q:v', '3', framePath]);
        return fs.existsSync(framePath) ? framePath : null;
    } catch {
        return null;
    }
}

function imageToBase64(imagePath: string): string | null {
    try {
        const data = fs.readFileSync(imagePath);
        return data.toString('base64');
    } catch {
        return null;
    }
}

async function verifyWithOllama(base64Image: string, keywords: string): Promise<VerificationResult> {
    const prompt = `Does this image match the concept: "${keywords}"?
Answer ONLY with a JSON object: {"passes": true/false, "confidence": 0-10, "reason": "short reason"}
confidence 0 =完全不匹配, 10 =完美匹配.`;

    const response = await ollamaGenerateWithImage(
        'You are a strict image-content verifier. You must respond with valid JSON only.',
        prompt,
        base64Image,
        'json',
    );

    return parseVerificationResponse(response);
}

async function verifyWithGemini(base64Image: string, keywords: string, mimeType: string): Promise<VerificationResult> {
    if (!GEMINI_API_KEY) {
        return { passes: true, confidence: 5, reason: 'No Gemini API key configured, skipping verification' };
    }

    const prompt = `Does this image match the concept: "${keywords}"?
Answer ONLY with a JSON object: {"passes": true/false, "confidence": 0-10, "reason": "short reason"}`;

    const { data } = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
            contents: [
                {
                    parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Image } }],
                },
            ],
            generationConfig: { temperature: 0.1, maxOutputTokens: 100 },
        },
        {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': GEMINI_API_KEY,
            },
            timeout: 30000,
        },
    );

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return parseVerificationResponse(text);
}

function parseVerificationResponse(text: string): VerificationResult {
    try {
        const cleaned = text
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim();
        const jsonStart = cleaned.indexOf('{');
        const jsonEnd = cleaned.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) {
            return { passes: true, confidence: 5, reason: 'Could not parse AI response' };
        }
        const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
        return {
            passes: parsed.passes === true,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 5,
            reason: parsed.reason || 'No reason given',
        };
    } catch {
        return { passes: true, confidence: 5, reason: 'Could not parse AI response' };
    }
}

export async function verifyMedia(filePath: string, keywords: string[]): Promise<VerificationResult> {
    const ext = path.extname(filePath).toLowerCase();
    const isVideo = ['.mp4', '.webm', '.mov', '.m4v', '.avi'].includes(ext);
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);

    if (!isVideo && !isImage) {
        return { passes: true, confidence: 10, reason: `Unsupported format: ${ext}` };
    }

    let imagePath = filePath;
    let mimeType = 'image/jpeg';

    if (isVideo) {
        console.log(`🧐 [VERIFY] Extracting frame from video: ${path.basename(filePath)}`);
        const outputDir = path.dirname(filePath);
        const frame = extractVideoFrame(filePath, outputDir);
        if (!frame) {
            return { passes: true, confidence: 5, reason: 'Could not extract video frame' };
        }
        imagePath = frame;
    }

    if (imagePath.endsWith('.png')) mimeType = 'image/png';
    else if (imagePath.endsWith('.webp')) mimeType = 'image/webp';
    else if (imagePath.endsWith('.gif')) mimeType = 'image/gif';

    const base64 = imageToBase64(imagePath);
    if (!base64) {
        return { passes: true, confidence: 5, reason: 'Could not read image file' };
    }

    const keywordStr = keywords.join(', ');
    console.log(`🧐 [VERIFY] Checking "${keywordStr}" against ${path.basename(imagePath)}...`);

    let result: VerificationResult;
    try {
        if (AI_PROVIDER === 'gemini' && GEMINI_API_KEY) {
            result = await verifyWithGemini(base64, keywordStr, mimeType);
        } else {
            result = await verifyWithOllama(base64, keywordStr);
        }
    } catch (err: any) {
        console.log(`🧐 [VERIFY] AI provider unavailable (${err.message}), skipping verification`);
        result = { passes: true, confidence: 5, reason: `AI provider unavailable: ${err.message}` };
    }

    console.log(
        `🧐 [VERIFY] Result: ${result.passes ? 'PASS' : 'FAIL'} (confidence: ${result.confidence}/10) — ${result.reason}`,
    );

    if (isVideo && imagePath !== filePath) {
        try {
            fs.unlinkSync(imagePath);
        } catch {
            /* ignore — cleanup */
        }
    }

    return result;
}

export function verificationPasses(result: VerificationResult): boolean {
    return result.passes && result.confidence >= MEDIA_VERIFICATION_CONFIDENCE;
}
