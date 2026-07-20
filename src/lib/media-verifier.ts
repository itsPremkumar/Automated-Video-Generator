import * as fs from 'fs';
import * as path from 'path';
import { spawnSync, spawn } from 'child_process';
import axios from 'axios';
import { generateContentWithImage as ollamaGenerateWithImage } from './ollama-client';
import { logInfo } from '../runtime';
import { ffmpegPath } from './ffmpeg.js';

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

function runFfmpeg(args: string[]): Promise<Buffer | null> {
    return new Promise((resolve) => {
        try {
            const bin = ffmpegPath();
            const timeoutMs = Number(process.env.AGENTIC_FFMPEG_TIMEOUT_MS || 15000);
            const child = spawn(bin, args, { stdio: 'pipe' } as any);
            const chunks: Buffer[] = [];
            const t = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                } catch {
                    /* ignore */
                }
                resolve(null);
            }, timeoutMs);
            child.stdout?.on('data', (d: Buffer) => chunks.push(d));
            child.on('error', () => {
                clearTimeout(t);
                resolve(null);
            });
            child.on('close', (code: number) => {
                clearTimeout(t);
                resolve(code === 0 ? Buffer.concat(chunks) : null);
            });
        } catch {
            resolve(null);
        }
    });
}

export interface VerificationResult {
    passes: boolean;
    confidence: number;
    reason: string;
}

export interface VisionCheckOptions {
    /** Also screen for watermarks / embedded text overlays. */
    checkWatermark?: boolean;
    /** Also screen for NSFW / unsafe content. */
    checkSafety?: boolean;
    /**
     * Fail-closed mode. When true (default), if the requested AI backend is
     * unavailable or its response cannot be parsed, verification returns
     * `passes: false` (the asset is treated as NOT verified) instead of
     * silently passing. This prevents off-topic/unsafe assets from slipping
     * through when the verifier is misconfigured. Set false only for
     * best-effort / non-blocking checks.
     */
    failClosed?: boolean;
    /**
     * For video: number of frames to sample (default 1, taken near the
     * middle). More frames = better coverage but more API calls.
     */
    sampleFrames?: number;
}

const DEFAULT_VISION_OPTS: VisionCheckOptions = {
    checkWatermark: true,
    checkSafety: true,
    failClosed: true,
    sampleFrames: 1,
};

/**
 * Build a result for the "verification could not actually run" case.
 * In fail-closed mode this is a FAIL (asset not verified); otherwise it is a
 * neutral PASS so the caller's existing signal-based path is unaffected.
 */
function unavailableResult(reason: string, opts: VisionCheckOptions): VerificationResult {
    const failClosed = opts.failClosed !== false;
    return {
        passes: !failClosed,
        confidence: failClosed ? 0 : 5,
        reason: `${failClosed ? '[FAIL-CLOSED] ' : ''}${reason}`,
    };
}

async function extractVideoFrame(videoPath: string, outputDir: string): Promise<string | null> {
    const framePath = path.join(outputDir, `verify_frame_${path.basename(videoPath)}.jpg`);
    if (fs.existsSync(framePath)) return framePath;
    try {
        await runFfmpeg(['-y', '-i', videoPath, '-vframes', '1', '-q:v', '3', framePath]);
        return fs.existsSync(framePath) ? framePath : null;
    } catch {
        return null;
    }
}

/**
 * Extract N frames spread across the video timeline (for the final-render
 * gate / multi-frame coverage). Returns the list of written frame paths.
 * Falls back to a single middle frame if duration probing fails.
 */
async function extractVideoFrames(videoPath: string, outputDir: string, count: number): Promise<string[]> {
    const safeCount = Math.max(1, Math.min(count || 1, 8));
    const frames: string[] = [];
    const base = path.join(outputDir, `verify_frame_${path.basename(videoPath)}`);
    try {
        const durBuf = await runFfmpeg(['-i', videoPath]);
        const durMatch = durBuf?.toString().match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
        let durationSec = 0;
        if (durMatch) {
            const [, h, m, s] = durMatch;
            durationSec = Number(h) * 3600 + Number(m) * 60 + Number(s);
        }
        for (let i = 0; i < safeCount; i++) {
            const ts = durationSec > 0 ? (durationSec * (i + 1)) / (safeCount + 1) : i * 1;
            const fp = `${base}_${i}.jpg`;
            await runFfmpeg(['-y', '-ss', String(ts.toFixed(2)), '-i', videoPath, '-vframes', '1', '-q:v', '3', fp]);
            if (fs.existsSync(fp)) frames.push(fp);
        }
    } catch {
        /* ignore — caller falls back */
    }
    if (frames.length === 0) {
        const single = await extractVideoFrame(videoPath, outputDir);
        if (single) frames.push(single);
    }
    return frames;
}

function imageToBase64(imagePath: string): string | null {
    try {
        const data = fs.readFileSync(imagePath);
        return data.toString('base64');
    } catch {
        return null;
    }
}

async function verifyWithOllama(
    base64Image: string,
    keywords: string,
    opts: VisionCheckOptions,
): Promise<VerificationResult> {
    let prompt = `Does this image match the concept: "${keywords}"?`;
    if (opts.checkWatermark) {
        prompt += ` Is there any visible WATERMARK or embedded TEXT overlay? (watermark must be false if none)`;
    }
    if (opts.checkSafety) {
        prompt += ` Is the content SAFE and not NSFW? (safe must be true)`;
    }
    prompt += `
Answer ONLY with a JSON object: {"passes": true/false, "confidence": 0-10, "reason": "short reason", "watermark": true/false, "safe": true/false}
confidence 0 = completely unrelated, 10 = perfect match.`;

    const response = await ollamaGenerateWithImage(
        'You are a strict image-content verifier. You must respond with valid JSON only.',
        prompt,
        base64Image,
        'json',
    );

    return parseVerificationResponse(response, opts);
}

async function verifyWithGemini(
    base64Image: string,
    keywords: string,
    mimeType: string,
    opts: VisionCheckOptions,
): Promise<VerificationResult> {
    if (!GEMINI_API_KEY) {
        return unavailableResult('No Gemini API key configured, verification could not run', opts);
    }

    let prompt = `Does this image match the concept: "${keywords}"?`;
    if (opts.checkWatermark) {
        prompt += ` Is there any visible WATERMARK or embedded TEXT overlay? (watermark must be false if none)`;
    }
    if (opts.checkSafety) {
        prompt += ` Is the content SAFE and not NSFW? (safe must be true)`;
    }
    prompt += `
Answer ONLY with a JSON object: {"passes": true/false, "confidence": 0-10, "reason": "short reason", "watermark": true/false, "safe": true/false}`;

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
    return parseVerificationResponse(text, opts);
}

function parseVerificationResponse(text: string, opts: VisionCheckOptions): VerificationResult {
    try {
        const cleaned = text
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .trim();
        const jsonStart = cleaned.indexOf('{');
        const jsonEnd = cleaned.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) {
            // No JSON object in the response -> could not actually verify.
            // Fail-closed so unparseable AI output can't silently pass.
            return unavailableResult('Could not parse AI response (no JSON found)', opts);
        }
        const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
        return {
            passes: parsed.passes === true,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 5,
            reason: parsed.reason || 'No reason given',
        };
    } catch {
        // JSON present but invalid -> fail-closed, do NOT silently pass.
        return unavailableResult('Could not parse AI response', opts);
    }
}

export async function verifyMedia(
    filePath: string,
    keywords: string[],
    opts: VisionCheckOptions = DEFAULT_VISION_OPTS,
): Promise<VerificationResult> {
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
        const frame = await extractVideoFrame(filePath, outputDir);
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
            result = await verifyWithGemini(base64, keywordStr, mimeType, opts);
        } else {
            result = await verifyWithOllama(base64, keywordStr, opts);
        }
    } catch (err: any) {
        console.log(`🧐 [VERIFY] AI provider unavailable (${err.message}), failing closed`);
        result = unavailableResult(`AI provider unavailable: ${err.message}`, opts);
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

/**
 * M8 — Post-render (final) AI gate. Runs after the full video is rendered.
 * Samples `sampleFrames` frames spread across the finished MP4 and verifies
 * each against the keywords. The render FAILS the gate if ANY sampled frame
 * fails verification (or if verification cannot run and failClosed is on).
 * This catches garbage / off-topic frames that slipped past per-asset checks.
 *
 * Default mode is `signal` (opt-in via MEDIA_VERIFICATION_ENABLED); pass
 * `final: vision` to enable this stronger post-render pass.
 */
export async function verifyFinalRender(
    filePath: string,
    keywords: string[],
    opts: VisionCheckOptions = DEFAULT_VISION_OPTS,
): Promise<VerificationResult> {
    if (!MEDIA_VERIFICATION_ENABLED) {
        return {
            passes: true,
            confidence: 10,
            reason: 'Media verification disabled (MEDIA_VERIFICATION_ENABLED=false)',
        };
    }
    const ext = path.extname(filePath).toLowerCase();
    const isVideo = ['.mp4', '.webm', '.mov', '.m4v', '.avi'].includes(ext);
    if (!isVideo) {
        // For images, just verify the single file.
        return verifyMedia(filePath, keywords, opts);
    }

    const outputDir = path.dirname(filePath);
    const frames = await extractVideoFrames(filePath, outputDir, opts.sampleFrames || 1);
    if (frames.length === 0) {
        return unavailableResult('Could not extract any frame from final render', opts);
    }

    const keywordStr = keywords.join(', ');
    let worst: VerificationResult = { passes: true, confidence: 10, reason: 'all sampled frames passed' };
    for (const frame of frames) {
        let base64: string | null = null;
        try {
            base64 = imageToBase64(frame);
        } catch {
            base64 = null;
        }
        if (!base64) {
            worst = unavailableResult('Could not read sampled frame', opts);
            break;
        }
        let r: VerificationResult;
        try {
            r =
                AI_PROVIDER === 'gemini' && GEMINI_API_KEY
                    ? await verifyWithGemini(base64, keywordStr, 'image/jpeg', opts)
                    : await verifyWithOllama(base64, keywordStr, opts);
        } catch (err: any) {
            r = unavailableResult(`AI provider unavailable: ${err.message}`, opts);
        }
        if (!r.passes || r.confidence < MEDIA_VERIFICATION_CONFIDENCE) {
            worst = { passes: false, confidence: r.confidence, reason: `frame failed: ${r.reason}` };
            break;
        }
        if (r.confidence < worst.confidence) worst = r;
        try {
            fs.unlinkSync(frame);
        } catch {
            /* ignore — cleanup */
        }
    }
    return worst;
}
