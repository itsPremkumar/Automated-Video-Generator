import axios from 'axios';
import { readEnvValues } from './env.service';
import { BadRequestError, ServiceUnavailableError } from '../lib/errors';
import { appLogger } from '../lib/logger';
import { generateContent as ollamaGenerateContent } from '../lib/ollama-client';

export interface ScriptGenerationResult {
    title: string;
    script: string;
}

const aiLogger = appLogger.child({ component: 'ai-service', provider: 'gemini' });
const GEMINI_TIMEOUT_MS = Math.max(5000, Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '30000', 10) || 30000);
const GEMINI_MAX_RETRIES = Math.max(1, Number.parseInt(process.env.GEMINI_MAX_RETRIES || '2', 10) || 2);
const AI_PROVIDER = process.env.AI_PROVIDER?.trim().toLowerCase() || 'ollama';

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

async function generateViaOllama(systemInstruction: string, prompt: string): Promise<string> {
    return ollamaGenerateContent(systemInstruction, prompt);
}

export async function generateScriptFromPrompt(prompt: string): Promise<ScriptGenerationResult> {
    const useOllama = AI_PROVIDER === 'ollama';

    if (useOllama) {
        const systemInstruction = 'You are a video script writer. Keep responses concise and well-structured.';
        const userPrompt = `Write a short video script about: ${prompt}

The script must include:
- [Visual: ...] tags before each scene (short 3-6 word descriptions like "cinematic drone city sunset")
- The spoken narration text after each visual tag
- NO speaker labels like "Narrator:" or "Voiceover:"

At the very start of your response, put the title on its own line like: TITLE: Your Title Here
Then write the full script with [Visual: ...] tags.

Example format:
TITLE: Benefits of Water
[Visual: person drinking water]
Staying hydrated is essential for your health.
[Visual: glowing skin closeup]
Water helps keep your skin healthy and radiant.`;

        const content = await generateViaOllama(systemInstruction, userPrompt);
        const lines = content.split('\n');
        let title = 'Untitled AI Script';
        const scriptLines: string[] = [];
        for (const line of lines) {
            if (line.startsWith('TITLE:')) {
                title = line.replace('TITLE:', '').trim();
            } else {
                scriptLines.push(line);
            }
        }
        return { title, script: scriptLines.join('\n').trim() };
    }

    const systemInstruction = `You are an expert video script director. Turn the user's prompt into a highly detailed, engaging, and comprehensive video script.
Follow these rules exactly:
1. Divide the video into scenes. Include [Visual: ...] tags at the start of scenes to describe what we see.
2. The spoken text must follow the visual tags.
3. IMPORTANT: Do NOT include prefixes like (Narrator), Voiceover:, or speaker names before the spoken text. The TTS engine will literally read them out loud. Only provide the exact dialogue to be spoken.
4. Keep [Visual: ...] tags SHORT and CONCISE (3-6 words). Use descriptive search keywords like "cinematic drone city sunset" or "close up coding on laptop". DO NOT write long paragraphs or over-explain. These are used as search queries for stock footage.
5. Respond with ONLY a valid JSON object matching this schema: {"title": "A short video title", "script": "The full detailed script with visual tags... "}.
6. Do NOT include markdown blocks like \`\`\`json. Return just the raw JSON.`;

    const content = await generateGeminiContent(systemInstruction, prompt);

    try {
        const parsed = parseJsonPayload<{ script?: string; title?: string }>(content, '');
        return { title: parsed.title || 'Untitled AI Script', script: parsed.script || content };
    } catch {
        return { title: 'Untitled AI Script', script: content };
    }
}

export async function refineSceneAI(
    text: string,
    keywords: string[],
    instruction: string,
): Promise<{ voiceoverText: string; searchKeywords: string[] }> {
    const useOllama = AI_PROVIDER === 'ollama';

    if (useOllama) {
        const systemInstruction = 'You are a helpful video editor. Keep responses concise.';
        const prompt = `Current scene text: "${text}"
Current search keywords: ${JSON.stringify(keywords)}
User instruction: "${instruction}"

Return ONLY the updated scene text (the spoken narration). Do not include any JSON or extra text.`;

        const content = await generateViaOllama(systemInstruction, prompt);
        return {
            voiceoverText: content.trim() || text,
            searchKeywords: keywords,
        };
    }

    const systemInstruction = `You are a video script editor. Refine the provided scene based on the user's instructions.
Return ONLY a valid JSON object: {"voiceoverText": "Updated text", "searchKeywords": ["word1", "word2"]}.
Keep keywords concise (3-6 words). Do NOT include markdown formatting.`;

    const prompt = `
Current Scene Text: "${text}"
Current Keywords: ${JSON.stringify(keywords)}
User Instruction: "${instruction}"
`;

    const content = await generateGeminiContent(systemInstruction, prompt);

    try {
        return parseJsonPayload<{ voiceoverText: string; searchKeywords: string[] }>(
            content,
            'Failed to refine scene with AI.',
        );
    } catch {
        try {
            const fallback = parseJsonPayload<{ text: string; keywords?: string[] }>(content, '');
            return {
                voiceoverText: fallback.text || text,
                searchKeywords: fallback.keywords || keywords,
            };
        } catch {
            return { voiceoverText: text, searchKeywords: keywords };
        }
    }
}
