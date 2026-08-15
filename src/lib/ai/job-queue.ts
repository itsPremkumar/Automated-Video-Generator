/**
 * ai/job-queue.ts — serial job queue for local AI processing.
 *
 * On 6GB RAM hardware, running AI jobs in parallel causes OOM.
 * This queue runs ONE AI job at a time, in FIFO order.
 * Jobs are persisted to JSON so they survive restarts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logError, logWarn } from '../../shared/logging/runtime-logging.js';
import type { AiJobKind, AiJobResult, AiQueueStatus } from './types.js';

interface QueuedJob {
    id: string;
    kind: AiJobKind;
    payload: any;
    enqueuedAt: number;
    startedAt?: number;
    completedAt?: number;
    result?: AiJobResult;
    status: 'pending' | 'running' | 'completed' | 'failed';
}

const QUEUE_DIR = path.resolve(process.cwd(), 'workspace', 'ai-queue');
const QUEUE_FILE = path.join(QUEUE_DIR, 'jobs.json');

function ensureQueueDir(): void {
    fs.mkdirSync(QUEUE_DIR, { recursive: true });
}

function loadJobs(): QueuedJob[] {
    try {
        if (!fs.existsSync(QUEUE_FILE)) return [];
        const raw = fs.readFileSync(QUEUE_FILE, 'utf-8');
        return JSON.parse(raw) as QueuedJob[];
    } catch {
        return [];
    }
}

function saveJobs(jobs: QueuedJob[]): void {
    ensureQueueDir();
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(jobs, null, 2));
}

let isProcessing = false;

/**
 * Enqueue an AI job. Returns the job ID.
 */
export function enqueueJob(kind: AiJobKind, payload: any): string {
    const jobs = loadJobs();
    const id = `ai-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    jobs.push({
        id,
        kind,
        payload,
        enqueuedAt: Date.now(),
        status: 'pending',
    });
    saveJobs(jobs);
    logInfo(`[AI-QUEUE] Enqueued ${kind} job ${id} (queue: ${jobs.filter(j => j.status === 'pending').length})`);
    // Auto-trigger processing
    processQueue().catch(() => {});
    return id;
}

/**
 * Process jobs one at a time.
 */
export async function processQueue(): Promise<void> {
    if (isProcessing) return;
    isProcessing = true;

    const handlers: Record<AiJobKind, (payload: any) => Promise<AiJobResult>> = {
        'image-gen': wrapProvider(() => import('./providers/comfyui.js'), 'generateImage'),
        'video-gen': wrapProvider(() => import('./providers/cogvideo.js'), 'generateVideo'),
        'image-to-video': wrapProvider(() => import('./providers/animatediff.js'), 'generateMotion'),
        'upscale': wrapProvider(() => import('./providers/upscale.js'), 'upscale'),
        'bg-removal': wrapProvider(() => import('./providers/bg-removal.js'), 'removeBg'),
        'beat-detect': wrapProvider(() => import('./intelligence/beat-sync.js'), 'detectBeats'),
        'clip-embed': wrapProvider(() => import('./intelligence/clip-match.js'), 'embed'),
        'script-enhance': wrapProvider(() => import('./intelligence/script-enhance.js'), 'enhance'),
        'translate': wrapProvider(() => import('./intelligence/translate.js'), 'translate'),
        'storyboard': wrapProvider(() => import('./intelligence/storyboard.js'), 'generate'),
    };

    try {
        while (true) {
            const jobs = loadJobs();
            const next = jobs.find(j => j.status === 'pending');
            if (!next) break;

            next.status = 'running';
            next.startedAt = Date.now();
            saveJobs(jobs);

            const handler = handlers[next.kind];
            let result: AiJobResult;

            try {
                if (!handler) {
                    result = { ok: false, outputPath: '', provider: 'none', durationMs: 0, error: `No handler for ${next.kind}` };
                } else {
                    result = await handler(next.payload);
                }
            } catch (e: any) {
                result = { ok: false, outputPath: '', provider: 'none', durationMs: 0, error: e?.message ?? String(e) };
            }

            // Update job status
            const updated = loadJobs();
            const job = updated.find(j => j.id === next.id);
            if (job) {
                job.status = result.ok ? 'completed' : 'failed';
                job.completedAt = Date.now();
                job.result = result;
            }
            saveJobs(updated);

            if (result.ok) {
                logInfo(`[AI-QUEUE] Completed ${next.kind} job ${next.id} (${result.durationMs}ms via ${result.provider})`);
            } else {
                logWarn(`[AI-QUEUE] Failed ${next.kind} job ${next.id}: ${result.error}`);
            }
        }
    } finally {
        isProcessing = false;
    }
}

function wrapProvider(importFn: () => Promise<any>, method: string): (payload: any) => Promise<AiJobResult> {
    return async (payload: any) => {
        const start = Date.now();
        try {
            const mod = await importFn();
            const fn = mod[method];
            if (typeof fn !== 'function') throw new Error(`Method ${method} not found`);
            const outputPath = await fn(payload);
            return { ok: true, outputPath, provider: method, durationMs: Date.now() - start };
        } catch (e: any) {
            return { ok: false, outputPath: '', provider: method, durationMs: Date.now() - start, error: e?.message ?? String(e) };
        }
    };
}

/**
 * Get current queue status.
 */
export function getQueueStatus(): AiQueueStatus {
    const jobs = loadJobs();
    return {
        queueLength: jobs.filter(j => j.status === 'pending').length,
        currentJob: jobs.find(j => j.status === 'running')?.id ?? null,
        completedCount: jobs.filter(j => j.status === 'completed').length,
        failedCount: jobs.filter(j => j.status === 'failed').length,
    };
}

/**
 * Get result for a specific job.
 */
export function getJobResult(jobId: string): AiJobResult | null {
    const jobs = loadJobs();
    const job = jobs.find(j => j.id === jobId);
    return job?.result ?? null;
}

/**
 * Clear completed/failed jobs.
 */
export function clearFinishedJobs(): void {
    const jobs = loadJobs();
    const active = jobs.filter(j => j.status === 'pending' || j.status === 'running');
    saveJobs(active);
    logInfo(`[AI-QUEUE] Cleared finished jobs (${jobs.length - active.length} removed)`);
}
