import * as fs from 'fs';
import * as path from 'path';
import { pipelineAppService } from '../../application/pipeline-app.service';
import { cleanupAssets } from '../../lib/cleaner';
import { resetInMemoryCache } from '../../lib/visual-fetcher';
import { PipelineJobRequest } from '../../shared/contracts/job.contract';

const INPUT_DIR = path.join(process.cwd(), 'input');
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
    musicVolume?: number;
    language?: string;
    textConfig?: PipelineJobRequest['textConfig'];
};

function parseArgs() {
    const args = process.argv.slice(2);
    const landscape = args.includes('--landscape');
    const resume = args.includes('--resume');
    const segmentOnly = args.includes('--segment');
    const musicIdx = args.indexOf('--music');
    const music = (musicIdx !== -1 && args[musicIdx + 1] && !args[musicIdx + 1].startsWith('--'))
        ? args[musicIdx + 1]
        : undefined;

    return {
        landscape,
        resume,
        segmentOnly,
        music,
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

function buildRequest(job: CliVideoJob, globalOrientation: 'portrait' | 'landscape', globalMusic?: string): PipelineJobRequest {
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
    const videoDir = path.join(process.cwd(), 'public', 'videos');
    const audioDir = path.join(process.cwd(), 'public', 'audio');
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

    const { landscape, resume, segmentOnly, music } = parseArgs();
    const globalOrientation = landscape ? 'landscape' : getEnvOrientation();

    await prepareWorkspace(resume);
    const jobs = readJobs();

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
            const videoDir = path.join(process.cwd(), 'public', 'videos');
            const audioDir = path.join(process.cwd(), 'public', 'audio');
            await cleanupAssets([videoDir, audioDir]);
        }
    }
}
