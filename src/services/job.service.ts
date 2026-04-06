import * as fs from 'fs';
import * as path from 'path';
import { generateVideo } from '../video-generator';
import { renderVideo } from '../render';
import { JobPhase, JobRequestOptions, JobStatus, jobStore, resolveProjectPath } from '../runtime';
import { findVideoFile, sanitizeFolderTitle } from './video.service';
import { DEFAULT_FALLBACK_VIDEO, MAX_CONCURRENT_JOBS } from '../constants/config';
import { ConflictError, NotFoundError } from '../lib/errors';
import { appLogger } from '../lib/logger';
import { JOB_CANCELLATION_MESSAGE, isJobCancellationError } from '../lib/job-cancellation';

const schedulerLogger = appLogger.child({ component: 'job-service' });

type QueuePhase = 'generate' | 'render';
type RetryMode = 'generate' | 'review' | 'render';

interface JobTask {
    execute: () => Promise<void>;
    jobId: string;
    phase: QueuePhase;
    queuedMessage: string;
}

const pendingTasks: JobTask[] = [];
const queuedTaskKeys = new Set<string>();
const activeTaskKeys = new Set<string>();
let activeTaskCount = 0;

function buildTaskKey(jobId: string, phase: QueuePhase): string {
    return `${jobId}:${phase}`;
}

function buildErrorDetails(error: unknown): string {
    const unsafe = error as {
        stack?: string;
        stderr?: { toString(): string };
        stdout?: { toString(): string };
    };
    const parts = [unsafe?.stack || String(error)];

    if (unsafe?.stderr) {
        parts.push(`STDERR:\n${unsafe.stderr.toString()}`);
    }

    if (unsafe?.stdout) {
        parts.push(`STDOUT:\n${unsafe.stdout.toString()}`);
    }

    return parts.filter(Boolean).join('\n\n');
}

function isTerminalStatus(status: JobStatus['status']): boolean {
    return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function inferActivePhase(job: JobStatus): JobPhase {
    return job.phase === 'completed' ? 'render' : job.phase;
}

function getJobOrThrow(jobId: string): JobStatus {
    const job = jobStore.get(jobId);
    if (!job) {
        throw new NotFoundError('Job not found.');
    }

    return job;
}

function getStoredRequest(jobId: string): NonNullable<JobStatus['request']> {
    const job = getJobOrThrow(jobId);
    if (!job.request) {
        throw new ConflictError('This job does not have a stored request snapshot and cannot be retried automatically.');
    }

    return job.request;
}

function ensurePublicId(jobId: string): string {
    const job = getJobOrThrow(jobId);
    if (job.publicId) {
        return job.publicId;
    }

    const title = job.request?.title || job.title || 'video';
    const slug = sanitizeFolderTitle(title) || 'video';
    const publicId = `${slug}_${Date.now()}`;
    jobStore.set(jobId, { publicId });
    return publicId;
}

function getOutputDir(jobId: string): string {
    const job = getJobOrThrow(jobId);
    if (job.publicId) {
        return resolveProjectPath('output', job.publicId);
    }

    if (job.outputPath) {
        return path.dirname(job.outputPath);
    }

    const publicId = ensurePublicId(jobId);
    return resolveProjectPath('output', publicId);
}

function hasSceneData(jobId: string): boolean {
    return fs.existsSync(path.join(getOutputDir(jobId), 'scene-data.json'));
}

function isCancelRequested(jobId: string): boolean {
    const job = jobStore.get(jobId);
    return job?.cancelRequested === true;
}

function assertNotCancelled(jobId: string, message = JOB_CANCELLATION_MESSAGE): void {
    if (isCancelRequested(jobId)) {
        throw new Error(message);
    }
}

function markJobCancelled(jobId: string, message: string, phase?: JobPhase): void {
    const existing = jobStore.get(jobId);
    jobStore.set(jobId, {
        status: 'cancelled',
        phase: phase || (existing ? inferActivePhase(existing) : 'generate'),
        progress: existing?.progress ?? 0,
        message,
        cancelRequested: false,
        error: undefined,
        errorDetails: undefined,
        endTime: Date.now(),
    });
}

function markJobFailed(jobId: string, message: string, error: unknown, phase?: JobPhase): void {
    if (isJobCancellationError(error) || (error instanceof Error && error.message === JOB_CANCELLATION_MESSAGE)) {
        markJobCancelled(jobId, 'Job cancelled before completion.', phase);
        return;
    }

    const normalized = error instanceof Error ? error : new Error(String(error));
    const existing = jobStore.get(jobId);
    jobStore.set(jobId, {
        status: 'failed',
        phase: phase || (existing ? inferActivePhase(existing) : 'generate'),
        progress: existing?.progress ?? 100,
        message,
        error: normalized.message || 'Unknown server error.',
        errorDetails: buildErrorDetails(error),
        cancelRequested: false,
        endTime: Date.now(),
    });
}

function refreshPendingMessages(): void {
    pendingTasks.forEach((task, index) => {
        const job = jobStore.get(task.jobId);
        if (!job || isTerminalStatus(job.status) || job.status === 'awaiting_review' || job.status === 'cancelling' || job.cancelRequested) {
            return;
        }

        jobStore.set(task.jobId, {
            status: 'pending',
            phase: task.phase === 'render' ? 'render' : 'generate',
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

function removePendingTask(jobId: string, phase?: QueuePhase): boolean {
    let removed = false;

    for (let index = pendingTasks.length - 1; index >= 0; index -= 1) {
        const task = pendingTasks[index];
        if (task.jobId !== jobId || (phase && task.phase !== phase)) {
            continue;
        }

        pendingTasks.splice(index, 1);
        queuedTaskKeys.delete(buildTaskKey(task.jobId, task.phase));
        removed = true;
    }

    if (removed) {
        refreshPendingMessages();
    }

    return removed;
}

function hasQueuedOrActiveTask(jobId: string, phase: QueuePhase): boolean {
    const taskKey = buildTaskKey(jobId, phase);
    return queuedTaskKeys.has(taskKey) || activeTaskKeys.has(taskKey);
}

function hasActiveTask(jobId: string, phase: QueuePhase): boolean {
    return activeTaskKeys.has(buildTaskKey(jobId, phase));
}

async function runRenderPipeline(jobId: string, outputDir: string): Promise<void> {
    assertNotCancelled(jobId);
    jobStore.set(jobId, {
        status: 'processing',
        phase: 'render',
        progress: 75,
        message: 'Rendering final MP4.',
    });

    await renderVideo(outputDir, {
        shouldCancel: () => isCancelRequested(jobId),
    });

    assertNotCancelled(jobId);
    const finalVideo = findVideoFile(outputDir);
    if (!finalVideo) {
        jobStore.set(jobId, {
            status: 'failed',
            phase: 'render',
            progress: 100,
            message: 'Render finished without a final MP4.',
            error: 'No final video file found.',
            errorDetails: `The Remotion process completed but output directory ${outputDir} is missing the MP4 file.`,
            cancelRequested: false,
            endTime: Date.now(),
        });
        return;
    }

    jobStore.set(jobId, {
        status: 'completed',
        phase: 'completed',
        progress: 100,
        message: 'Video ready for playback and download.',
        outputPath: path.join(outputDir, finalVideo),
        cancelRequested: false,
        endTime: Date.now(),
    });
}

async function runGenerationPipeline(
    jobId: string,
    outputDir: string,
    request: NonNullable<JobStatus['request']>,
): Promise<void> {
    const { title, script, options } = request;
    assertNotCancelled(jobId);
    jobStore.set(jobId, {
        status: 'processing',
        phase: 'generate',
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
        shouldCancel: () => isCancelRequested(jobId),
        onProgress: (step: string, percent: number, message: string) => {
            assertNotCancelled(jobId);
            jobStore.set(jobId, {
                status: 'processing',
                phase: 'generate',
                progress: 5 + Math.round((percent / 100) * 60),
                message: `${step}: ${message}`,
            });
        },
    });

    if (!result.success) {
        if (isCancelRequested(jobId) || result.error === JOB_CANCELLATION_MESSAGE) {
            markJobCancelled(jobId, 'Job cancelled while generating assets.', 'generate');
            return;
        }

        jobStore.set(jobId, {
            status: 'failed',
            phase: 'generate',
            progress: 100,
            message: 'Generation failed before render.',
            error: result.error || 'Unknown generation error.',
            errorDetails: (result as { errorDetails?: string }).errorDetails || result.error || 'Unknown generation error.',
            cancelRequested: false,
            endTime: Date.now(),
        });
        return;
    }

    assertNotCancelled(jobId);
    if (!options.skipReview) {
        jobStore.set(jobId, {
            status: 'awaiting_review',
            phase: 'review',
            progress: 70,
            message: 'Assets prepared. Awaiting your review in the Timeline Editor.',
            cancelRequested: false,
            endTime: undefined,
        });
        return;
    }

    await runRenderPipeline(jobId, outputDir);
}

function queueGeneration(jobId: string, options: { incrementRetry?: boolean; resetStartTime?: boolean } = {}): void {
    if (hasQueuedOrActiveTask(jobId, 'generate')) {
        throw new ConflictError('A generation task is already queued for this job.');
    }

    const job = getJobOrThrow(jobId);
    const request = getStoredRequest(jobId);
    const outputDir = getOutputDir(jobId);
    fs.mkdirSync(outputDir, { recursive: true });

    jobStore.set(jobId, {
        title: request.title,
        publicId: ensurePublicId(jobId),
        status: 'pending',
        phase: 'generate',
        progress: 0,
        message: 'Queued for asset generation.',
        outputPath: undefined,
        error: undefined,
        errorDetails: undefined,
        cancelRequested: false,
        endTime: undefined,
        retryCount: options.incrementRetry ? job.retryCount + 1 : job.retryCount,
        startTime: options.resetStartTime ? Date.now() : job.startTime,
    });

    enqueueTask({
        jobId,
        phase: 'generate',
        queuedMessage: 'Queued for asset generation.',
        execute: async () => {
            try {
                await runGenerationPipeline(jobId, outputDir, request);
            } catch (error) {
                markJobFailed(jobId, 'A fatal error occurred while processing the job.', error, 'generate');
            }
        },
    });
}

export async function createAndRunJob(
    jobId: string,
    publicId: string,
    title: string,
    script: string,
    options: JobRequestOptions,
) {
    jobStore.set(jobId, {
        title,
        publicId,
        status: 'pending',
        phase: 'generate',
        progress: 0,
        message: 'Queued for processing.',
        cancelRequested: false,
        retryCount: 0,
        request: {
            title,
            script,
            options,
        },
    });

    queueGeneration(jobId);
}

export async function continueJobToRender(
    jobId: string,
    options: { allowRecovery?: boolean; incrementRetry?: boolean } = {},
): Promise<{ alreadyQueued: boolean; mode: RetryMode }> {
    if (hasQueuedOrActiveTask(jobId, 'render')) {
        return { alreadyQueued: true, mode: 'render' };
    }

    const job = getJobOrThrow(jobId);
    const canRecover = options.allowRecovery === true && (job.status === 'failed' || job.status === 'cancelled') && job.phase === 'render';
    if (job.status !== 'awaiting_review' && !canRecover) {
        throw new ConflictError('Job is not ready to render.');
    }

    const outputDir = getOutputDir(jobId);
    if (!fs.existsSync(path.join(outputDir, 'scene-data.json'))) {
        throw new ConflictError('Scene data is missing, so rendering cannot continue.');
    }

    jobStore.set(jobId, {
        status: 'pending',
        phase: 'render',
        progress: Math.max(job.progress, 70),
        message: 'Queued for final render.',
        error: undefined,
        errorDetails: undefined,
        cancelRequested: false,
        endTime: undefined,
        retryCount: options.incrementRetry ? job.retryCount + 1 : job.retryCount,
        startTime: options.incrementRetry ? Date.now() : job.startTime,
    });

    enqueueTask({
        jobId,
        phase: 'render',
        queuedMessage: 'Queued for final render.',
        execute: async () => {
            try {
                await runRenderPipeline(jobId, outputDir);
            } catch (error) {
                markJobFailed(jobId, 'A fatal error occurred while rendering the job after review.', error, 'render');
            }
        },
    });

    return { alreadyQueued: false, mode: 'render' };
}

export async function cancelJob(jobId: string): Promise<{ completed: boolean; pending: boolean }> {
    const job = getJobOrThrow(jobId);
    if (isTerminalStatus(job.status)) {
        throw new ConflictError('Only active or reviewable jobs can be cancelled.');
    }

    const phase = inferActivePhase(job);
    const removedQueuedGeneration = removePendingTask(jobId, 'generate');
    const removedQueuedRender = removePendingTask(jobId, 'render');

    if (removedQueuedGeneration || removedQueuedRender) {
        markJobCancelled(jobId, 'Job cancelled before queued work started.', phase);
        return { completed: true, pending: false };
    }

    if (job.status === 'awaiting_review') {
        markJobCancelled(jobId, 'Job cancelled from the review stage.', 'review');
        return { completed: true, pending: false };
    }

    if (hasActiveTask(jobId, 'generate') || hasActiveTask(jobId, 'render') || job.status === 'processing') {
        jobStore.set(jobId, {
            status: 'cancelling',
            phase,
            cancelRequested: true,
            message: phase === 'render'
                ? 'Cancellation requested. Rendering will stop after the current safe checkpoint.'
                : 'Cancellation requested. Generation will stop after the current safe checkpoint.',
            endTime: undefined,
        });
        return { completed: false, pending: false };
    }

    markJobCancelled(jobId, 'Job cancelled.', phase);
    return { completed: true, pending: job.status === 'pending' };
}

export async function retryJob(jobId: string): Promise<{ alreadyQueued: boolean; mode: RetryMode }> {
    const job = getJobOrThrow(jobId);
    if (job.status !== 'failed' && job.status !== 'cancelled') {
        throw new ConflictError('Only failed or cancelled jobs can be retried.');
    }

    getStoredRequest(jobId);

    if (job.phase === 'review' && hasSceneData(jobId)) {
        jobStore.set(jobId, {
            status: 'awaiting_review',
            phase: 'review',
            progress: 70,
            message: 'Assets restored. Review the timeline and confirm render when ready.',
            error: undefined,
            errorDetails: undefined,
            cancelRequested: false,
            endTime: undefined,
            retryCount: job.retryCount + 1,
            startTime: Date.now(),
        });
        return { alreadyQueued: false, mode: 'review' };
    }

    if (job.phase === 'render' && hasSceneData(jobId)) {
        return continueJobToRender(jobId, {
            allowRecovery: true,
            incrementRetry: true,
        });
    }

    queueGeneration(jobId, {
        incrementRetry: true,
        resetStartTime: true,
    });
    return { alreadyQueued: false, mode: 'generate' };
}
