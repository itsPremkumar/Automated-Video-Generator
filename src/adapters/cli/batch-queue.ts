/**
 * Batch queue manager for the CLI video generator.
 *
 * Implements Feature B of the PRE-15 spec: a managed, resumable batch with
 * explicit concurrency, per-job status, retry, and a machine-readable summary.
 *
 * - Concurrency is bounded by the existing `MAX_CONCURRENT_JOBS` env (see
 *   `src/constants/config.ts`), not a new knob.
 * - Retries use `AVG_BATCH_MAX_RETRIES` (default 1) with a fixed backoff.
 * - `--resume` re-reads the manifest in `output/batch-manifest.json` and skips
 *   completed jobs.
 *
 * This module is intentionally I/O + scheduler-light: it does not talk to the
 * pipeline engine directly, it receives an `executeJob` callback so it can be
 * unit-tested against a fake without spinning up Remotion.
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { resolveProjectPath } from '../../shared/runtime/paths';

/**
 * Read an integer env knob at *call time* (not at module load) so the batch
 * honors live overrides of `MAX_CONCURRENT_JOBS` / `AVG_BATCH_MAX_RETRIES` /
 * `AVG_BATCH_RETRY_BACKOFF_MS`. The imported/captured module-level constants
 * freeze at import, which is too early for tests and for env changes between
 * runs.
 */
function readEnvInt(name: string, fallback: number, min: number): number {
    const raw = process.env[name];
    if (raw === undefined) {
        return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < min) {
        return fallback;
    }
    return parsed;
}

function readMaxConcurrentJobs(): number {
    return Math.max(1, readEnvInt('MAX_CONCURRENT_JOBS', 1, 1));
}

function readAvgBatchMaxRetries(): number {
    return Math.max(0, readEnvInt('AVG_BATCH_MAX_RETRIES', 1, 0));
}

function readRetryBackoffMs(): number {
    return Math.max(0, readEnvInt('AVG_BATCH_RETRY_BACKOFF_MS', 1500, 0));
}

export const BATCH_MANIFEST_PATH = resolveProjectPath('output', 'batch-manifest.json');

export type JobOutcome = 'completed' | 'failed' | 'cancelled' | 'pending';

const jobSchema = z.object({
    id: z.string(),
    index: z.number().int(),
    title: z.string(),
    outcome: z.enum(['completed', 'failed', 'cancelled', 'pending']),
    attempts: z.number().int().min(0),
    outputPath: z.string().optional(),
    error: z.string().optional(),
    startedAt: z.number().nullable(),
    finishedAt: z.number().nullable(),
});

export const batchManifestSchema = z.object({
    version: z.literal(1),
    concurrency: z.number().int().positive(),
    maxRetries: z.number().int().min(0),
    createdAt: z.number(),
    updatedAt: z.number(),
    jobs: z.array(jobSchema),
});

export type BatchJobEntry = z.infer<typeof jobSchema>;
export type BatchManifest = z.infer<typeof batchManifestSchema>;

export interface BatchJobInput {
    /** Stable identifier; reused as the resume key. */
    id: string;
    /** Original position in the input file (0-based). */
    index: number;
    title: string;
}

export interface RunBatchOptions {
    concurrency?: number;
    maxRetries?: number;
    failFast?: boolean;
    resume?: boolean;
    onlyIds?: string[];
    /** Execute one job. Must resolve with a result describing outcome. */
    executeJob: (job: BatchJobInput) => Promise<BatchJobResult>;
}

export interface BatchJobResult {
    outcome: JobOutcome;
    outputPath?: string;
    error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isPermanentError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /schema|validation|invalid/i.test(message);
}

function emptyManifest(concurrency: number, maxRetries: number): BatchManifest {
    const now = Date.now();
    return {
        version: 1,
        concurrency,
        maxRetries,
        createdAt: now,
        updatedAt: now,
        jobs: [],
    };
}

function readManifestSafe(manifestPath: string): BatchManifest | null {
    try {
        if (!fs.existsSync(manifestPath)) {
            return null;
        }
        const parsed = batchManifestSchema.safeParse(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function writeManifest(manifestPath: string, manifest: BatchManifest): void {
    const dir = path.dirname(manifestPath);
    fs.mkdirSync(dir, { recursive: true });
    manifest.updatedAt = Date.now();
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

function summarize(manifest: BatchManifest): BatchManifestSummary {
    const counts = { completed: 0, failed: 0, cancelled: 0, pending: 0 };
    for (const job of manifest.jobs) {
        counts[job.outcome] += 1;
    }
    return {
        total: manifest.jobs.length,
        ...counts,
        allCompleted: counts.failed === 0 && counts.cancelled === 0 && counts.pending === 0,
    };
}

export interface BatchManifestSummary {
    total: number;
    completed: number;
    failed: number;
    cancelled: number;
    pending: number;
    allCompleted: boolean;
}

/**
 * Run a batch of jobs through a bounded-concurrency pool with retry + resume.
 *
 * @returns the written manifest (also persisted to `output/batch-manifest.json`)
 */
export async function runBatch(
    inputs: BatchJobInput[],
    options: RunBatchOptions,
    manifestPath: string = BATCH_MANIFEST_PATH,
): Promise<BatchManifest> {
    const concurrency = Math.max(1, options.concurrency ?? readMaxConcurrentJobs());
    const maxRetries = Math.max(0, options.maxRetries ?? readAvgBatchMaxRetries());

    const previous = options.resume ? readManifestSafe(manifestPath) : null;
    const completedIds = new Set((previous?.jobs ?? []).filter((j) => j.outcome === 'completed').map((j) => j.id));

    const onlyIds = options.onlyIds && options.onlyIds.length > 0 ? new Set(options.onlyIds) : null;

    const entries = new Map<string, BatchJobEntry>();
    if (previous) {
        for (const job of previous.jobs) {
            entries.set(job.id, { ...job });
        }
    }
    for (const input of inputs) {
        if (!entries.has(input.id)) {
            entries.set(input.id, {
                id: input.id,
                index: input.index,
                title: input.title,
                outcome: 'pending',
                attempts: 0,
                startedAt: null,
                finishedAt: null,
            });
        }
    }

    const queue = inputs.filter((input) => {
        if (completedIds.has(input.id)) {
            return false;
        }
        if (onlyIds && !onlyIds.has(input.id)) {
            return false;
        }
        return true;
    });

    const manifest: BatchManifest = previous ?? emptyManifest(concurrency, maxRetries);

    const orderedQueue = [...queue].sort((a, b) => a.index - b.index);
    const active = new Set<Promise<void>>();
    let failedHard = false;

    const worker = async (input: BatchJobInput): Promise<void> => {
        if (failedHard) {
            return;
        }

        const entry = entries.get(input.id)!;
        let attempts = 0;
        let outcome: JobOutcome = 'failed';
        let outputPath: string | undefined;
        let lastError: string | undefined;

        entry.startedAt = Date.now();
        entry.attempts = 0;
        writeManifest(manifestPath, manifest);

        for (;;) {
            attempts += 1;
            entry.attempts = attempts;
            try {
                const result = await options.executeJob(input);
                outcome = result.outcome;
                outputPath = result.outputPath;
                lastError = result.error;
            } catch (error) {
                outcome = 'failed';
                lastError = error instanceof Error ? error.message : String(error);
            }

            if (outcome === 'completed' || outcome === 'cancelled') {
                break;
            }

            // `failed`: retry on transient, mark permanently failed on schema errors.
            const canRetry = attempts <= maxRetries && !isPermanentError(lastError);
            if (!canRetry) {
                break;
            }

            await sleep(readRetryBackoffMs());
        }

        entry.outcome = outcome;
        entry.outputPath = outputPath;
        entry.error = outcome === 'failed' ? lastError : undefined;
        entry.finishedAt = Date.now();
        entries.set(input.id, entry);
        writeManifest(manifestPath, manifest);

        if (outcome === 'failed' && options.failFast) {
            failedHard = true;
        }
    };

    for (const input of orderedQueue) {
        if (failedHard) {
            break;
        }
        const task = worker(input).then(() => {
            active.delete(task);
        });
        active.add(task);

        if (active.size >= concurrency) {
            await Promise.race(active);
        }
    }

    await Promise.allSettled([...active]);

    manifest.jobs = [...entries.values()].sort((a, b) => a.index - b.index);
    writeManifest(manifestPath, manifest);
    return manifest;
}

export { readManifestSafe, summarize };
