/**
 * error-sanitize.ts — Security-conscious error message sanitization.
 *
 * Strips API keys, tokens, passwords, and URLs with credentials from
 * error messages before they are logged or displayed to users.
 */

const URL_USERINFO_RE = /((?:https?|wss?):\/\/)([^/\s?#@]*:[^/\s?#@]*@)/gi;
const API_KEY_RE = /([?&](?:api[_-]?key|access[_-]?token|token|key|secret|password)=)([^&\s]+)/gi;
const BEARER_RE = /(Bearer\s+)[A-Za-z0-9._-]+/gi;
const BASIC_RE = /(Basic\s+)[A-Za-z0-9+/=]+/gi;

/** Sanitize an error message to remove sensitive information */
export function sanitizeError(error: unknown): string {
    let message: string;
    
    if (error instanceof Error) {
        message = error.message;
    } else if (typeof error === 'string') {
        message = error;
    } else {
        message = String(error);
    }

    // Strip URLs with embedded credentials
    message = message.replace(URL_USERINFO_RE, '$1***:***@');
    
    // Strip API keys from query parameters
    message = message.replace(API_KEY_RE, '$1***');
    
    // Strip Bearer tokens
    message = message.replace(BEARER_RE, '$1***');
    
    // Strip Basic auth
    message = message.replace(BASIC_RE, '$1***');

    return message;
}

/** Sanitize a URL to remove query parameters with potential secrets */
export function sanitizeUrl(url: string): string {
    try {
        const parsed = new URL(url);
        const params = parsed.searchParams;
        for (const key of Array.from(params.keys())) {
            if (/api[_-]?key|access[_-]?token|token|key|secret|password/i.test(key)) {
                params.set(key, '***');
            }
        }
        return parsed.toString();
    } catch {
        return url;
    }
}

/** Create a sanitized error (for re-throwing) */
export function createSanitizedError(original: Error): Error {
    const sanitized = sanitizeError(original.message);
    const error = new Error(sanitized);
    error.stack = original.stack;
    return error;
}
