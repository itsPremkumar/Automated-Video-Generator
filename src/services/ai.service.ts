import axios from 'axios';
import { readEnvValues } from './env.service';
import { BadRequestError, ServiceUnavailableError } from '../lib/errors';
import { appLogger } from '../lib/logger';

export interface ScriptGenerationResult {
    title: string;
    script: string;
}

const aiLogger = appLogger.child({ component: 'ai-service', provider: 'gemini' });
const GEMINI_TIMEOUT_MS = Math.max(5000, Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '30000', 10) || 30000);
const GEMINI_MAX_RETRIES = Math.max(1, Number.parseInt(process.env.GEMINI_MAX_RETRIES || '2', 10) || 2);

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGeminiApiKey(): string {
    const envValues = readEnvValues();
    const apiKey = envValues.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new ServiceUnavailableError('GEMINI_API_KEY is not set. Please save it in the portal setup.');
    }

    return apiKey;
}

function buildGeminiUrl(apiKey: string): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
}

function shouldRetry(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
        return false;
    }

    if (error.code === 'ECONNABORTED') {
        return true;
    }

    const statusCode = error.response?.status;
    return !statusCode || statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function mapGeminiError(error: unknown): ServiceUnavailableError {
    if (error instanceof ServiceUnavailableError) {
        return error;
    }

    if (axios.isAxiosError(error)) {
        const geminiMessage = error.response?.data?.error?.message;
        if (geminiMessage) {
            if (geminiMessage.includes('API key not valid')) {
                return new ServiceUnavailableError('Your Gemini API key is invalid or unauthorized.', {
                    provider: 'gemini',
                });
            }

            return new ServiceUnavailableError(`Gemini API error: ${geminiMessage}`, {
                provider: 'gemini',
                statusCode: error.response?.status,
            });
        }

        return new ServiceUnavailableError(error.message || 'Unknown network error occurred while reaching Gemini API.', {
            provider: 'gemini',
            statusCode: error.response?.status,
        });
    }

    return new ServiceUnavailableError('Unknown network error occurred while reaching Gemini API.', {
        provider: 'gemini',
    });
}

function parseJsonPayload<T>(content: string, malformedMessage: string): T {
    try {
        return JSON.parse(content) as T;
    } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]) as T;
            } catch {
                aiLogger.warn('ai.response.parse_failed', { preview: content.slice(0, 200) });
            }
        }

        throw new BadRequestError(malformedMessage);
    }
}

async function generateGeminiContent(systemInstruction: string, prompt: string): Promise<string> {
    const apiKey = getGeminiApiKey();
    const url = buildGeminiUrl(apiKey);

    for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt += 1) {
        try {
            const response = await axios.post(url, {
                system_instruction: { parts: { text: systemInstruction } },
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { response_mime_type: 'application/json' },
            }, {
                timeout: GEMINI_TIMEOUT_MS,
            });

            const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!content) {
                throw new ServiceUnavailableError('Invalid or empty response from Gemini AI.', {
                    provider: 'gemini',
                });
            }

            return content;
        } catch (error) {
            const retriable = attempt < GEMINI_MAX_RETRIES && shouldRetry(error);
            if (retriable) {
                const delayMs = attempt * 750;
                aiLogger.warn('ai.request.retrying', { attempt, delayMs }, error);
                await sleep(delayMs);
                continue;
            }

            throw mapGeminiError(error);
        }
    }

    throw new ServiceUnavailableError('Gemini request failed.', { provider: 'gemini' });
}

export async function generateScriptFromPrompt(prompt: string): Promise<ScriptGenerationResult> {
    const systemInstruction = `You are an expert video script director. Turn the user's prompt into a highly detailed, engaging, and comprehensive video script.
Follow these rules exactly:
1. Divide the video into scenes. Include [Visual: ...] tags at the start of scenes to describe what we see.
2. The spoken text must follow the visual tags.
3. IMPORTANT: Do NOT include prefixes like (Narrator), Voiceover:, or speaker names before the spoken text. The TTS engine will literally read them out loud. Only provide the exact dialogue to be spoken.
4. Keep [Visual: ...] tags SHORT and CONCISE (3-6 words). Use descriptive search keywords like "cinematic drone city sunset" or "close up coding on laptop". DO NOT write long paragraphs or over-explain. These are used as search queries for stock footage.
5. Respond with ONLY a valid JSON object matching this schema: {"title": "A short video title", "script": "The full detailed script with visual tags... "}.
6. Do NOT include markdown blocks like \`\`\`json. Return just the raw JSON.`;

    const content = await generateGeminiContent(systemInstruction, prompt);
    const parsed = parseJsonPayload<{ script?: string; title?: string }>(content, 'AI returned a malformed script format.');

    return {
        title: parsed.title || 'Untitled AI Script',
        script: parsed.script || content,
    };
}

export async function refineSceneAI(
    text: string,
    keywords: string[],
    instruction: string,
): Promise<{ voiceoverText: string; searchKeywords: string[] }> {
    const systemInstruction = `You are a video script editor. Refine the provided scene based on the user's instructions.
Return ONLY a valid JSON object: {"voiceoverText": "Updated text", "searchKeywords": ["word1", "word2"]}.
Keep keywords concise (3-6 words). Do NOT include markdown formatting.`;

    const prompt = `
Current Scene Text: "${text}"
Current Keywords: ${JSON.stringify(keywords)}
User Instruction: "${instruction}"
`;

    const content = await generateGeminiContent(systemInstruction, prompt);
    return parseJsonPayload<{ voiceoverText: string; searchKeywords: string[] }>(
        content,
        'Failed to refine scene with AI.',
    );
}
