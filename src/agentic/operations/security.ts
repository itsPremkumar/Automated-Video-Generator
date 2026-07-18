/**
 * security.ts — small, dependency-free security helpers for the operations
 * layer.
 *
 *  - safeOutputPath: ensures a caller-supplied output path can NEVER escape
 *    the project's output/ directory (blocks `../` path traversal from MCP /
 *    API / programmatic callers that pass `out`).
 *  - redactSecrets: scrubs secret-shaped values from arbitrary text/objects
 *    before logging, so crash dumps and error details don't leak keys.
 */

import * as path from 'path';
import * as fs from 'fs';

/** Root directory that all operation outputs must live under. */
function outputRoot(): string {
    return path.resolve(process.cwd(), 'output');
}

/**
 * Resolve a requested output path.
 * - If `out` is omitted/empty, returns undefined (callers fall back to their
 *   own default inside output/).
 * - If `out` is supplied, it must resolve to a path INSIDE outputRoot().
 *   Absolute paths outside output/, or any path containing `..` that escapes,
 *   are rejected with an Error (path traversal guard).
 */
export function safeOutputPath(out?: string): string | undefined {
    if (!out || !out.trim()) return undefined;
    const root = outputRoot();
    const resolved = path.isAbsolute(out) ? path.resolve(out) : path.resolve(root, out);
    // Canonical traversal check (platform-independent): the resolved path must
    // be exactly the root or live underneath it.
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new Error(`path traversal blocked: output path "${out}" resolves outside the output directory`);
    }
    // Ensure the parent exists so the op can write.
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    return resolved;
}

const SECRET_KEY_RE =
    /(api[_-]?key|apikey|secret|token|password|passwd|authorization|ghp_|sk-|ai_key|private[_-]?key)\s*[:=]\s*['"]?([^\s'"<>]{4,})/gi;

/**
 * Replace secret-shaped `key=value` / `key: value` pairs in a string with a
 * redaction marker. Safe to call on arbitrary log text.
 */
export function redactSecrets(text: string): string {
    if (!text) return text;
    return text.replace(SECRET_KEY_RE, (_m, k, v) => `${k}=[REDACTED:${v.length} chars]`);
}

/** Redact secrets inside an object's stringified form (e.g. error context). */
export function redactSecretsIn(obj: unknown): unknown {
    if (typeof obj === 'string') return redactSecrets(obj);
    if (obj && typeof obj === 'object') {
        try {
            const s = JSON.stringify(obj);
            const redacted = redactSecrets(s);
            return JSON.parse(redacted);
        } catch {
            return obj;
        }
    }
    return obj;
}
