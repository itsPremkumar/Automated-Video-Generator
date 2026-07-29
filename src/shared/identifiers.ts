/**
 * identifiers.ts — Shared identifier normalization for cross-entry-point consistency.
 *
 * The agentic pipeline has two entry points (agentic-modular.ts and agentic-batch.ts)
 * that must produce the same workspace folder for the same job.id. This shared
 * function ensures both generate identical normalized IDs.
 */

/**
 * Normalize a job ID to filesystem-safe lowercase underscore form:
 * - Lowercase
 * - All non-alphanumeric sequences → single underscore
 * - Max 64 chars
 *
 * This matches the convention used by agentic-batch.ts so that modular commands
 * (plan, visuals, voice, render, edit) can find workspaces created by batch
 * commands (compose, download-images, etc.) and vice versa.
 */
export function normalizeJobId(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')    // strip leading/trailing underscores
        .slice(0, 64)
        || `job_${Date.now()}`;
}
