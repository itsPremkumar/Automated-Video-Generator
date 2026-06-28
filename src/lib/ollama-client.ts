import axios from 'axios';
import { ServiceUnavailableError } from './errors';
import { appLogger } from './logger';

export interface OllamaGenerateResponse {
    model: string;
    response: string;
    done: boolean;
    context?: number[];
}

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL?.trim() || 'moondream:latest';
const OLLAMA_TIMEOUT_MS = Math.max(5000, Number.parseInt(process.env.OLLAMA_TIMEOUT_MS || '120000', 10) || 120000);
const OLLAMA_MAX_RETRIES = Math.max(1, Number.parseInt(process.env.OLLAMA_MAX_RETRIES || '2', 10) || 2);

const ollamaLogger = appLogger.child({ component: 'ollama-client', model: OLLAMA_MODEL });

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
        return false;
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ECONNREFUSED') {
        return true;
    }
    const statusCode = error.response?.status;
    return !statusCode || statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function mapOllamaError(error: unknown): ServiceUnavailableError {
    if (error instanceof ServiceUnavailableError) {
        return error;
    }
    if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
            return new ServiceUnavailableError(
                `Cannot connect to Ollama at ${OLLAMA_BASE_URL}. Make sure Ollama is running and the model "${OLLAMA_MODEL}" is pulled.`,
                { provider: 'ollama' },
            );
        }
        return new ServiceUnavailableError(`Ollama API error: ${error.message}`, {
            provider: 'ollama',
            statusCode: error.response?.status,
        });
    }
    return new ServiceUnavailableError('Unknown error while reaching Ollama API.', { provider: 'ollama' });
}

export async function generateContent(
    systemInstruction: string,
    prompt: string,
    format?: 'json',
): Promise<string> {
    return generateContentWithImage(systemInstruction, prompt, undefined, format);
}

export async function generateContentWithImage(
    systemInstruction: string,
    prompt: string,
    base64Image?: string,
    format?: 'json',
): Promise<string> {
    const body: Record<string, unknown> = {
        model: OLLAMA_MODEL,
        prompt,
        system: systemInstruction,
        stream: false,
    };
    if (format === 'json') {
        body.format = 'json';
    }
    if (base64Image) {
        body.images = [base64Image];
    }

    for (let attempt = 1; attempt <= OLLAMA_MAX_RETRIES; attempt += 1) {
        try {
            const response = await axios.post<OllamaGenerateResponse>(
                `${OLLAMA_BASE_URL}/api/generate`,
                body,
                {
                    timeout: OLLAMA_TIMEOUT_MS,
                    headers: { 'Content-Type': 'application/json' },
                },
            );

            const content = response.data?.response;
            if (!content) {
                throw new ServiceUnavailableError('Invalid or empty response from Ollama.', {
                    provider: 'ollama',
                });
            }

            return content;
        } catch (error) {
            const retriable = attempt < OLLAMA_MAX_RETRIES && shouldRetry(error);
            if (retriable) {
                const delayMs = attempt * 750;
                ollamaLogger.warn('ollama.request.retrying', { attempt, delayMs }, error);
                await sleep(delayMs);
                continue;
            }
            throw mapOllamaError(error);
        }
    }
    throw new ServiceUnavailableError('Ollama request failed after all retries.', { provider: 'ollama' });
}
