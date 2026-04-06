import { DEFAULT_FALLBACK_VIDEO } from '../constants/config';
import { sanitizeFolderTitle } from '../services/video.service';
import {
    cancelJob as cancelJobExecution,
    continueJobToRender as continueJobExecution,
    createAndRunJob,
    registerJobForRender,
    retryJob as retryJobExecution,
} from '../services/job.service';
import { jobStore } from '../infrastructure/persistence/job-store';
import { JobStatus, PipelineJobAccepted, PipelineJobRequest, pipelineJobRequestSchema } from '../shared/contracts/job.contract';
import { setupService } from './setup.service';

type ContinueResult = Awaited<ReturnType<typeof continueJobExecution>>;
type CancelResult = Awaited<ReturnType<typeof cancelJobExecution>>;
type RetryResult = Awaited<ReturnType<typeof retryJobExecution>>;

type PipelineAppServiceDeps = {
    createAndRunJob: typeof createAndRunJob;
    registerJobForRender: typeof registerJobForRender;
    continueJobToRender: typeof continueJobExecution;
    cancelJob: typeof cancelJobExecution;
    retryJob: typeof retryJobExecution;
    getJob: typeof jobStore.get;
    listJobs: typeof jobStore.all;
    setup: typeof setupService;
};

function defaultIds(title: string, preferredPublicId?: string, preferredJobId?: string) {
    const slug = sanitizeFolderTitle(title) || 'video';
    const timestamp = Date.now();

    return {
        publicId: preferredPublicId || `${slug}_${timestamp}`,
        jobId: preferredJobId || `job_${timestamp}_${slug.replace(/_/g, '').slice(0, 12) || 'video'}`,
    };
}

export class PipelineAppService {
    constructor(private readonly deps: PipelineAppServiceDeps) {}

    async createJob(input: PipelineJobRequest): Promise<PipelineJobAccepted> {
        const request = pipelineJobRequestSchema.parse(input);
        const ids = defaultIds(request.title, request.publicId || request.id, request.id);

        await this.deps.createAndRunJob(
            ids.jobId,
            ids.publicId,
            request.title,
            request.script,
            {
                orientation: request.orientation,
                language: request.language || 'english',
                voice: request.voice,
                backgroundMusic: request.backgroundMusic || '',
                personalAudio: request.personalAudio,
                defaultVideo: request.defaultVideo || DEFAULT_FALLBACK_VIDEO,
                showText: request.showText !== false,
                textConfig: request.textConfig,
                skipReview: !!request.skipReview,
            },
        );

        return {
            jobId: ids.jobId,
            title: request.title,
            publicId: ids.publicId,
        };
    }

    createRenderReadyJob(input: PipelineJobRequest): PipelineJobAccepted {
        const request = pipelineJobRequestSchema.parse(input);
        const ids = defaultIds(request.title, request.publicId || request.id, request.id);

        this.deps.registerJobForRender(
            ids.jobId,
            ids.publicId,
            request.title,
            request.script,
            {
                orientation: request.orientation,
                language: request.language || 'english',
                voice: request.voice,
                backgroundMusic: request.backgroundMusic || '',
                personalAudio: request.personalAudio,
                defaultVideo: request.defaultVideo || DEFAULT_FALLBACK_VIDEO,
                showText: request.showText !== false,
                textConfig: request.textConfig,
                skipReview: true,
            },
        );

        return {
            jobId: ids.jobId,
            title: request.title,
            publicId: ids.publicId,
        };
    }

    continueJobToRender(jobId: string): Promise<ContinueResult> {
        return this.deps.continueJobToRender(jobId);
    }

    cancelJob(jobId: string): Promise<CancelResult> {
        return this.deps.cancelJob(jobId);
    }

    retryJob(jobId: string): Promise<RetryResult> {
        return this.deps.retryJob(jobId);
    }

    getJob(jobId: string) {
        return this.deps.getJob(jobId);
    }

    listJobs() {
        return this.deps.listJobs();
    }

    async waitForJobCompletion(jobId: string, options: { intervalMs?: number; timeoutMs?: number } = {}): Promise<JobStatus> {
        const intervalMs = options.intervalMs ?? 1000;
        const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
        const startedAt = Date.now();

        for (;;) {
            const job = this.deps.getJob(jobId);
            if (!job) {
                throw new Error(`Job "${jobId}" not found.`);
            }

            if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
                return job;
            }

            if (Date.now() - startedAt > timeoutMs) {
                throw new Error(`Timed out while waiting for job "${jobId}".`);
            }

            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
    }

    getSetupStatus() {
        return this.deps.setup.getSetupStatus();
    }

    getDiagnostics() {
        return this.deps.setup.getDiagnostics();
    }

    repairRuntimeDependencies() {
        return this.deps.setup.repairRuntimeDependencies();
    }
}

export const pipelineAppService = new PipelineAppService({
    createAndRunJob,
    registerJobForRender,
    continueJobToRender: continueJobExecution,
    cancelJob: cancelJobExecution,
    retryJob: retryJobExecution,
    getJob: jobStore.get.bind(jobStore),
    listJobs: jobStore.all.bind(jobStore),
    setup: setupService,
});
