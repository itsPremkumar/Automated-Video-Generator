/**
 * ai-gateway.ts — AI gateway compatibility layer.
 *
 * Supports multiple AI gateways and aggregation platforms:
 * - Cloudflare AI Gateway
 * - Ollama (local)
 * - LiteLLM
 * - OneAPI
 * - ModelScope (魔搭)
 * - AIHubMix
 * - AIML API
 * - EvoLink
 * - Groq
 * - Pollinations AI
 *
 * Identity-preserving: all gateways are OPT-IN via env config.
 * Falls back to direct provider if gateway not configured.
 */

import { logInfo, logWarn } from '../../shared/logging/runtime-logging.js';

export type GatewayType =
    | 'cloudflare'
    | 'ollama'
    | 'litellm'
    | 'oneapi'
    | 'modelscope'
    | 'aihubmix'
    | 'aimlapi'
    | 'evolink'
    | 'groq'
    | 'pollinations';

export interface GatewayConfig {
    type: GatewayType;
    baseUrl: string;
    apiKey?: string;
    model?: string;
    headers?: Record<string, string>;
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatResponse {
    content: string;
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

const GATEWAY_PRESETS: Record<GatewayType, { baseUrl: string; headers?: Record<string, string> }> = {
    cloudflare: {
        baseUrl: 'https://gateway.ai.cloudflare.com/v1',
        headers: {},
    },
    ollama: {
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    },
    litellm: {
        baseUrl: process.env.LITELLM_BASE_URL || 'http://localhost:4000',
    },
    oneapi: {
        baseUrl: process.env.ONEAPI_BASE_URL || '',
    },
    modelscope: {
        baseUrl: 'https://api-inference.modelscope.cn/v1',
    },
    aihubmix: {
        baseUrl: process.env.AIHUBMIX_BASE_URL || 'https://api.aihubmix.com/v1',
    },
    aimlapi: {
        baseUrl: 'https://api.aimlapi.com/v1',
    },
    evolink: {
        baseUrl: process.env.EVOLINK_BASE_URL || '',
    },
    groq: {
        baseUrl: 'https://api.groq.com/openai/v1',
    },
    pollinations: {
        baseUrl: 'https://text.pollinations.ai',
    },
};

/** Get gateway config from environment */
export function getGatewayConfig(): GatewayConfig | null {
    const type = process.env.AI_GATEWAY_TYPE as GatewayType | undefined;
    if (!type) return null;

    const preset = GATEWAY_PRESETS[type];
    if (!preset) return null;

    return {
        type,
        baseUrl: process.env.AI_GATEWAY_BASE_URL || preset.baseUrl,
        apiKey: process.env.AI_GATEWAY_API_KEY,
        model: process.env.AI_GATEWAY_MODEL,
        headers: preset.headers,
    };
}

/** Check if a gateway is configured */
export function isGatewayConfigured(): boolean {
    return getGatewayConfig() !== null;
}

/** Build headers for gateway request */
function buildHeaders(config: GatewayConfig): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...config.headers,
    };
    if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
    return headers;
}

/** Build the full API URL for a gateway */
function buildUrl(config: GatewayConfig): string {
    switch (config.type) {
        case 'cloudflare':
            // Cloudflare: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/openai/chat/completions
            return `${config.baseUrl}/chat/completions`;
        case 'ollama':
            return `${config.baseUrl}/api/chat`;
        case 'pollinations':
            return `${config.baseUrl}/openai/chat/completions`;
        default:
            return `${config.baseUrl}/chat/completions`;
    }
}

/** Send a chat completion request via the configured gateway */
export async function chatCompletion(
    messages: ChatMessage[],
    options: { temperature?: number; max_tokens?: number; model?: string } = {},
): Promise<ChatResponse> {
    const config = getGatewayConfig();
    if (!config) {
        throw new Error('No AI gateway configured');
    }

    const url = buildUrl(config);
    const headers = buildHeaders(config);
    const model = options.model || config.model;

    let body: any;

    // Ollama uses a different API format
    if (config.type === 'ollama') {
        body = {
            model: model || 'llama3.2',
            messages,
            stream: false,
            options: {
                temperature: options.temperature ?? 0.7,
                num_predict: options.max_tokens,
            },
        };
    } else {
        // OpenAI-compatible format
        body = {
            model: model || 'gpt-4o-mini',
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.max_tokens,
        };
    }

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Gateway ${config.type} returned ${res.status}: ${text.slice(0, 200)}`);
        }

        const json = await res.json();

        // Parse response (handle both Ollama and OpenAI formats)
        let content: string;
        let usage: ChatResponse['usage'];

        if (config.type === 'ollama') {
            content = json?.message?.content || '';
            usage = json?.prompt_tokens ? {
                prompt_tokens: json.prompt_tokens,
                completion_tokens: json.completion_tokens,
                total_tokens: json.total_tokens,
            } : undefined;
        } else {
            content = json?.choices?.[0]?.message?.content || '';
            usage = json?.usage;
        }

        return {
            content,
            model: model || 'unknown',
            usage,
        };
    } catch (e: any) {
        logWarn(`[AI-GATEWAY] ${config.type} error: ${e?.message ?? e}`);
        throw e;
    }
}

/** List supported gateways */
export function listSupportedGateways(): GatewayType[] {
    return Object.keys(GATEWAY_PRESETS) as GatewayType[];
}

/** Get gateway display name */
export function getGatewayDisplayName(type: GatewayType): string {
    const names: Record<GatewayType, string> = {
        cloudflare: 'Cloudflare AI Gateway',
        ollama: 'Ollama (Local)',
        litellm: 'LiteLLM',
        oneapi: 'OneAPI',
        modelscope: 'ModelScope (魔搭)',
        aihubmix: 'AIHubMix',
        aimlapi: 'AIML API',
        evolink: 'EvoLink',
        groq: 'Groq',
        pollinations: 'Pollinations AI',
    };
    return names[type] || type;
}
