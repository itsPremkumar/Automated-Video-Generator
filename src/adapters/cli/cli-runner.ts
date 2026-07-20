import * as fs from 'fs';
import * as path from 'path';
import { pipelineAppService } from '../../application/pipeline-app.service';
import { cleanupAssets } from '../../lib/cleaner';
import { resetInMemoryCache } from '../../lib/visual-fetcher';
import { resolveWorkspacePath } from '../../shared/runtime/paths';
import { PipelineJobRequest } from '../../shared/contracts/job.contract';
import { runBatch, summarize, type BatchJobInput, type BatchJobResult } from './batch-queue';

    const INPUT_DIR = path.join(process.cwd(), 'input', 'scripts');
    const INPUT_SCRIPTS_FILE = path.join(INPUT_DIR, 'input-scripts.json');

type CliVideoJob = {
    id?: string;
    title: string;
    script: string;
    orientation?: 'portrait' | 'landscape';
    voice?: string;
    showText?: boolean;
    defaultVideo?: string;
    backgroundMusic?: string;
    personalAudio?: string;
    musicVolume?: number;
    language?: string;
    textConfig?: PipelineJobRequest['textConfig'];
};

function readFlagValue(args: string[], flag: string): string | undefined {
    const idx = args.indexOf(flag);
    if (idx === -1) return undefined;
    const next = args[idx + 1];
    return next && !next.startsWith('--') ? next : undefined;
}

function parseArgs() {
    const args = process.argv.slice(2);
    const landscape = args.includes('--landscape');
    const resume = args.includes('--resume');
    const segmentOnly = args.includes('--segment');
    const batch = args.includes('--batch');
    const failFast = args.includes('--fail-fast');
    const music = readFlagValue(args, '--music');

    const concurrencyRaw = readFlagValue(args, '--concurrency');
    const concurrency =
        concurrencyRaw !== undefined && Number.isFinite(Number.parseInt(concurrencyRaw, 10))
            ? Math.max(1, Number.parseInt(concurrencyRaw, 10))
            : undefined;

    const onlyRaw = readFlagValue(args, '--only');
    // Sanitize the same way job ids are derived (sanitizeFilename), so a human
    // writing `--only "Home Workout"` actually matches the job id `home_workout`.
    const onlyIds = onlyRaw
        ? onlyRaw
              .split(',')
              .map((s) => sanitizeFilename(s.trim()))
              .filter(Boolean)
        : undefined;

    return {
        landscape,
        resume,
        segmentOnly,
        batch,
        failFast,
        music,
        concurrency,
        onlyIds,
    };
}

function getEnvOrientation(): 'portrait' | 'landscape' {
    const envOrientation = process.env.VIDEO_ORIENTATION?.toLowerCase();
    if (envOrientation === 'landscape' || envOrientation === 'portrait') {
        return envOrientation;
    }

    return 'portrait';
}

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function readJobs(): CliVideoJob[] {
    if (!fs.existsSync(INPUT_SCRIPTS_FILE)) {
        process.exit(1);
    }

    try {
        const content = fs.readFileSync(INPUT_SCRIPTS_FILE, 'utf-8');
        return JSON.parse(content);
    } catch {
        process.exit(1);
    }
}

function buildRequest(
    job: CliVideoJob,
    globalOrientation: 'portrait' | 'landscape',
    globalMusic?: string,
): PipelineJobRequest {
    const jobOrientation = job.orientation || globalOrientation;
    const publicId = sanitizeFilename(job.id || job.title);

    return {
        id: publicId,
        publicId,
        title: job.title,
        script: job.script,
        orientation: jobOrientation,
        voice: job.voice,
        language: job.language,
        showText: job.showText !== false,
        defaultVideo: job.defaultVideo,
        backgroundMusic: job.backgroundMusic || globalMusic || '',
        personalAudio: job.personalAudio,
        musicVolume: job.musicVolume,
        textConfig: job.textConfig,
        skipReview: true,
    };
}

async function prepareWorkspace(resume: boolean) {
    if (resume) {
        console.log('[STARTUP] Resume mode active: Skipping asset cleanup to preserve existing files.');
        return;
    }

    console.log('[STARTUP] Cleaning old assets to avoid conflicts...');
    const videoDir = resolveWorkspacePath('tmp', 'videos');
    const audioDir = resolveWorkspacePath('tmp', 'audio');
    await cleanupAssets([videoDir, audioDir]);
    console.log('[STARTUP] Resetting .video-cache.json for fresh run');
    resetInMemoryCache();
}

async function runGenerateJob(job: CliVideoJob, index: number, total: number, request: PipelineJobRequest) {
    console.log(`\nProcessing Job ${index + 1}/${total}: "${job.title}" (${request.orientation})`);
    console.log('-'.repeat(50));

    const accepted = await pipelineAppService.createJob(request);
    const result = await pipelineAppService.waitForJobCompletion(accepted.jobId);

    if (result.status === 'completed') {
        console.log(`Completed "${job.title}".`);
        return;
    }

    console.error(`Failed "${job.title}": ${result.error || result.message}`);
}

async function runSegmentJob(job: CliVideoJob, index: number, total: number, request: PipelineJobRequest) {
    console.log(`\nProcessing Job ${index + 1}/${total}: "${job.title}" (segment mode)`);
    console.log('-'.repeat(50));

    const accepted = pipelineAppService.createRenderReadyJob(request);
    await pipelineAppService.continueJobToRender(accepted.jobId);
    const result = await pipelineAppService.waitForJobCompletion(accepted.jobId);

    if (result.status === 'completed') {
        console.log(`Assembled "${job.title}".`);
        return;
    }

    console.error(`Assembly failed for "${job.title}": ${result.error || result.message}`);
}

export async function runCli() {
    console.log('Video Generator CLI\n');

    const { landscape, resume, segmentOnly, batch, failFast, music, concurrency, onlyIds } = parseArgs();
    const globalOrientation = landscape ? 'landscape' : getEnvOrientation();

    await prepareWorkspace(resume);
    const jobs = readJobs();

    // Batch mode: bounded concurrency + retry + resumable manifest (PRE-15-B / PRE-62).
    if (batch || resume) {
        await runBatchMode(jobs, {
            globalOrientation,
            music,
            segmentOnly,
            concurrency,
            failFast,
            resume,
            onlyIds,
        });
        return;
    }

    for (let index = 0; index < jobs.length; index += 1) {
        const job = jobs[index];
        const request = buildRequest(job, globalOrientation, music);

        try {
            if (segmentOnly) {
                await runSegmentJob(job, index, jobs.length, request);
            } else {
                await runGenerateJob(job, index, jobs.length, request);
            }
        } finally {
            const videoDir = resolveWorkspacePath('tmp', 'videos');
            const audioDir = resolveWorkspacePath('tmp', 'audio');
            await cleanupAssets([videoDir, audioDir]);
        }
    }
}

interface BatchModeOptions {
    globalOrientation: 'portrait' | 'landscape';
    music?: string;
    segmentOnly: boolean;
    concurrency?: number;
    failFast: boolean;
    resume: boolean;
    onlyIds?: string[];
}

async function runBatchMode(jobs: CliVideoJob[], options: BatchModeOptions): Promise<void> {
    const inputs: BatchJobInput[] = jobs.map((job, index) => ({
        id: sanitizeFilename(job.id || job.title),
        index,
        title: job.title,
    }));
    const jobsById = new Map(inputs.map((input, index) => [input.id, jobs[index]]));

    console.log(
        `[BATCH] Starting batch of ${inputs.length} job(s)` +
            (options.resume ? ' (resume)' : '') +
            (options.onlyIds ? ` (only: ${options.onlyIds.join(', ')})` : ''),
    );

    const executeJob = async (input: BatchJobInput): Promise<BatchJobResult> => {
        const job = jobsById.get(input.id)!;
        const request = buildRequest(job, options.globalOrientation, options.music);
        try {
            if (options.segmentOnly) {
                const accepted = pipelineAppService.createRenderReadyJob(request);
                await pipelineAppService.continueJobToRender(accepted.jobId);
                const result = await pipelineAppService.waitForJobCompletion(accepted.jobId);
                if (result.status === 'completed') {
                    return { outcome: 'completed', outputPath: request.publicId };
                }
                return { outcome: 'failed', error: result.error || result.message };
            }

            const accepted = await pipelineAppService.createJob(request);
            const result = await pipelineAppService.waitForJobCompletion(accepted.jobId);
            if (result.status === 'completed') {
                return { outcome: 'completed', outputPath: request.publicId };
            }
            return { outcome: 'failed', error: result.error || result.message };
        } finally {
            const videoDir = resolveWorkspacePath('tmp', 'videos');
            const audioDir = resolveWorkspacePath('tmp', 'audio');
            await cleanupAssets([videoDir, audioDir]);
        }
    };

    const manifest = await runBatch(inputs, {
        concurrency: options.concurrency,
        failFast: options.failFast,
        resume: options.resume,
        onlyIds: options.onlyIds,
        executeJob,
    });

    const summary = summarize(manifest);
    console.log(
        `[BATCH] Done: ${summary.completed}/${summary.total} completed, ` +
            `${summary.failed} failed, ${summary.pending} pending, ${summary.cancelled} cancelled.`,
    );
    if (!summary.allCompleted) {
        console.error('[BATCH] Some jobs did not complete. Re-run with --resume to retry pending/failed jobs.');
        process.exitCode = 1;
    }
}
