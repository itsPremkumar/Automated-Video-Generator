import * as fs from 'fs';
import * as path from 'path';
import { generateVideo } from '../video-generator';
import { renderVideo } from '../render';
import { jobStore, resolveProjectPath } from '../runtime';
import { findVideoFile } from './video.service';
import { DEFAULT_FALLBACK_VIDEO, MAX_CONCURRENT_JOBS } from '../constants/config';
import { Orientation } from '../types/server.types';
import { ConflictError, NotFoundError } from '../lib/errors';
import { appLogger } from '../lib/logger';

const schedulerLogger = appLogger.child({ component: 'job-service' });

type JobPhase = 'generate' | 'render';

interface JobTask {
    execute: () => Promise<void>;
    jobId: string;
    phase: JobPhase;
    queuedMessage: string;
}

const pendingTasks: JobTask[] = [];
const queuedTaskKeys = new Set<string>();
const activeTaskKeys = new Set<string>();
let activeTaskCount = 0;

function buildTaskKey(jobId: string, phase: JobPhase): string {
    return `${jobId}:${phase}`;
}

function buildErrorDetails(error: any): string {
    const parts = [error?.stack || String(error)];

    if (error?.stderr) {
        parts.push(`STDERR:\n${error.stderr.toString()}`);
    }

    if (error?.stdout) {
        parts.push(`STDOUT:\n${error.stdout.toString()}`);
    }

    return parts.filter(Boolean).join('\n\n');
}

function markJobFailed(jobId: string, message: string, error: unknown): void {
    const normalized = error instanceof Error ? error : new Error(String(error));
    jobStore.set(jobId, {
        status: 'failed',
        progress: 100,
        message,
        error: normalized.message || 'Unknown server error.',
        errorDetails: buildErrorDetails(error),
        endTime: Date.now(),
    });
}

function refreshPendingMessages(): void {
    pendingTasks.forEach((task, index) => {
        const job = jobStore.get(task.jobId);
        if (!job || job.status === 'completed' || job.status === 'failed' || job.status === 'awaiting_review') {
            return;
        }

        jobStore.set(task.jobId, {
            status: 'pending',
            progress: job.progress > 0 ? job.progress : 0,
            message: index === 0 && activeTaskCount < MAX_CONCURRENT_JOBS
                ? task.queuedMessage
                : `${task.queuedMessage} Position ${index + 1} in queue.`,
        });
    });
}

function drainQueue(): void {
    while (activeTaskCount < MAX_CONCURRENT_JOBS && pendingTasks.length > 0) {
        const task = pendingTasks.shift()!;
        const taskKey = buildTaskKey(task.jobId, task.phase);

        queuedTaskKeys.delete(taskKey);
        activeTaskKeys.add(taskKey);
        activeTaskCount += 1;

        schedulerLogger.info('job.task.started', {
            jobId: task.jobId,
            phase: task.phase,
            activeTaskCount,
            queuedTasks: pendingTasks.length,
        });

        void task.execute()
            .catch((error) => {
                schedulerLogger.error('job.task.crashed', {
                    jobId: task.jobId,
                    phase: task.phase,
                }, error);
            })
            .finally(() => {
                activeTaskKeys.delete(taskKey);
                activeTaskCount -= 1;

                schedulerLogger.info('job.task.finished', {
                    jobId: task.jobId,
                    phase: task.phase,
                    activeTaskCount,
                    queuedTasks: pendingTasks.length,
                });

                refreshPendingMessages();
                drainQueue();
            });
    }

    refreshPendingMessages();
}

function enqueueTask(task: JobTask): boolean {
    const taskKey = buildTaskKey(task.jobId, task.phase);
    if (queuedTaskKeys.has(taskKey) || activeTaskKeys.has(taskKey)) {
        return false;
    }

    pendingTasks.push(task);
    queuedTaskKeys.add(taskKey);
    refreshPendingMessages();
    drainQueue();
    return true;
}

function hasQueuedOrActiveTask(jobId: string, phase: JobPhase): boolean {
    const taskKey = buildTaskKey(jobId, phase);
    return queuedTaskKeys.has(taskKey) || activeTaskKeys.has(taskKey);
}

async function runRenderPipeline(jobId: string, outputDir: string): Promise<void> {
    jobStore.set(jobId, {
        status: 'processing',
        progress: 75,
        message: 'Rendering final MP4.',
    });

    await renderVideo(outputDir);

    const finalVideo = findVideoFile(outputDir);
    if (!finalVideo) {
        jobStore.set(jobId, {
            status: 'failed',
            progress: 100,
            message: 'Render finished without a final MP4.',
            error: 'No final video file found.',
            errorDetails: `The Remotion process completed but output directory ${outputDir} is missing the MP4 file.`,
            endTime: Date.now(),
        });
        return;
    }

    jobStore.set(jobId, {
        status: 'completed',
        progress: 100,
        message: 'Video ready for playback and download.',
        outputPath: path.join(outputDir, finalVideo),
        endTime: Date.now(),
    });
}

async function runGenerationPipeline(
    jobId: string,
    title: string,
    script: string,
    outputDir: string,
    options: {
        orientation: Orientation;
        language: string;
        voice?: string;
        showText: boolean;
        backgroundMusic: string;
        personalAudio?: string;
        defaultVideo?: string;
        textConfig?: {
            color?: string;
            fontSize?: number;
            position?: 'top' | 'center' | 'bottom';
            animation?: 'fade' | 'slide' | 'zoom' | 'typewriter';
        };
        skipReview?: boolean;
    },
): Promise<void> {
    jobStore.set(jobId, {
        status: 'processing',
        progress: 5,
        message: 'Generating assets and voiceover.',
    });

    const result = await generateVideo(script, outputDir, {
        title,
        orientation: options.orientation,
        language: options.language,
        voice: options.voice,
        showText: options.showText,
        textConfig: options.textConfig,
        defaultVideo: options.defaultVideo || DEFAULT_FALLBACK_VIDEO,
        backgroundMusic: options.backgroundMusic,
        personalAudio: options.personalAudio,
        onProgress: (step: string, percent: number, message: string) => {
            jobStore.set(jobId, {
                status: 'processing',
                progress: 5 + Math.round((percent / 100) * 60),
                message: `${step}: ${message}`,
            });
        },
    });

    if (!result.success) {
        jobStore.set(jobId, {
            status: 'failed',
            progress: 100,
            message: 'Generation failed before render.',
            error: result.error || 'Unknown generation error.',
            errorDetails: (result as any).errorDetails || result.error || 'Unknown generation error.',
            endTime: Date.now(),
        });
        return;
    }

    if (!options.skipReview) {
        jobStore.set(jobId, {
            status: 'awaiting_review',
            progress: 70,
            message: 'Assets prepared. Awaiting your review in the Timeline Editor.',
        });
        return;
    }

    await runRenderPipeline(jobId, outputDir);
}

export async function createAndRunJob(
    jobId: string,
    publicId: string,
    title: string,
    script: string,
    options: {
        orientation: Orientation;
        language: string;
        voice?: string;
        showText: boolean;
        backgroundMusic: string;
        personalAudio?: string;
        defaultVideo?: string;
        textConfig?: {
            color?: string;
            fontSize?: number;
            position?: 'top' | 'center' | 'bottom';
            animation?: 'fade' | 'slide' | 'zoom' | 'typewriter';
        };
        skipReview?: boolean;
    },
) {
    const outputDir = resolveProjectPath('output', publicId);
    fs.mkdirSync(outputDir, { recursive: true });

    jobStore.set(jobId, {
        title,
        publicId,
        status: 'pending',
        progress: 0,
        message: 'Queued for processing.',
    });

    const queued = enqueueTask({
        jobId,
        phase: 'generate',
        queuedMessage: 'Queued for asset generation.',
        execute: async () => {
            try {
                await runGenerationPipeline(jobId, title, script, outputDir, options);
            } catch (error) {
                markJobFailed(jobId, 'A fatal error occurred while processing the job.', error);
            }
        },
    });

    if (!queued) {
        throw new ConflictError('A generation task is already queued for this job.');
    }
}

export async function continueJobToRender(jobId: string): Promise<{ alreadyQueued: boolean }> {
    const job = jobStore.get(jobId);
    if (!job) {
        throw new NotFoundError('Job not found.');
    }

    if (job.status !== 'awaiting_review' && !hasQueuedOrActiveTask(jobId, 'render')) {
        throw new ConflictError('Job is not ready to render.');
    }

    const outputDir = resolveProjectPath('output', job.publicId || path.basename(path.dirname(job.outputPath || '')));
    const queued = enqueueTask({
        jobId,
        phase: 'render',
        queuedMessage: 'Queued for final render.',
        execute: async () => {
            try {
                await runRenderPipeline(jobId, outputDir);
            } catch (error) {
                markJobFailed(jobId, 'A fatal error occurred while rendering the job after review.', error);
            }
        },
    });

    if (!queued) {
        return { alreadyQueued: true };
    }

    jobStore.set(jobId, {
        status: 'pending',
        progress: 70,
        message: 'Queued for final render.',
    });

    return { alreadyQueued: false };
}
