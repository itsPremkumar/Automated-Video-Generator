import * as path from 'path';
import * as fs from 'fs';
import { format } from 'util';

// Detect if running inside a packaged Electron app.
// When the server runs as a subprocess with ELECTRON_RUN_AS_NODE=1,
// process.versions.electron and process.resourcesPath are stripped.
// We fall back to the ELECTRON_BACKEND_SERVER env var set by electron-main.
const isElectronPackaged = (
    (!!(process.versions as any).electron && !(process.env as any).ELECTRON_IS_DEV && (process as any).resourcesPath)
    || (process.env.ELECTRON_BACKEND_SERVER === '1' && !!process.env.ELECTRON_RESOURCES_PATH)
);

// The resources path: either the native Electron property or the env var from electron-main
const resourcesPath: string = (process as any).resourcesPath
    || process.env.ELECTRON_RESOURCES_PATH
    || '';

export const projectRoot = isElectronPackaged
    ? (process.env.ELECTRON_APP_ROOT || path.join(resourcesPath, 'app'))
    : path.resolve(__dirname, '..');

export function resolveProjectPath(...segments: string[]): string {
    return path.join(projectRoot, ...segments);
}

/**
 * Resolve a path relative to the Electron resources directory.
 * In packaged mode, this points to e.g. resources/app-bundle/portable-python
 * In dev mode, this falls back to projectRoot.
 */
export function resolveResourcePath(...segments: string[]): string {
    if (resourcesPath) {
        return path.join(resourcesPath, ...segments);
    }
    return path.join(projectRoot, ...segments);
}

export function isElectron(): boolean {
    return !!(process.versions as any).electron || process.env.ELECTRON_BACKEND_SERVER === '1';
}

export function inMcpRuntime(): boolean {
  return process.env.AUTOMATED_VIDEO_GENERATOR_MCP === '1';
}

export function ensureProjectRootCwd(): void {
  if (process.cwd() !== projectRoot) {
    process.chdir(projectRoot);
  }
}

function writeLine(stream: NodeJS.WriteStream, message: string): void {
  stream.write(`${message}\n`);
}

function formatMessage(args: unknown[]): string {
  return format(...args);
}

export function logInfo(...args: unknown[]): void {
  const message = formatMessage(args);

  if (inMcpRuntime()) {
    writeLine(process.stderr, message);
    return;
  }

  console.log(message);
}

export function logWarn(...args: unknown[]): void {
  const message = formatMessage(args);

  if (inMcpRuntime()) {
    writeLine(process.stderr, message);
    return;
  }

  console.warn(message);
}

export function logError(...args: unknown[]): void {
  writeLine(process.stderr, formatMessage(args));
}

export function writeProgress(message: string): void {
  if (inMcpRuntime()) {
    process.stderr.write(message);
    return;
  }

  process.stdout.write(message);
}

// ══════════════════════════════════════════════════════════════════
// JOB STORE (MCP ASYNC PROCESSING)
// ══════════════════════════════════════════════════════════════════

export type JobState = 'pending' | 'processing' | 'awaiting_review' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
export type JobPhase = 'generate' | 'review' | 'render' | 'completed';

export interface JobTextConfig {
    color?: string;
    fontSize?: number;
    position?: 'top' | 'center' | 'bottom';
    animation?: 'fade' | 'slide' | 'zoom' | 'typewriter' | 'pop';
    background?: 'none' | 'box' | 'glass';
    glow?: boolean;
}

export interface JobRequestOptions {
    orientation: 'portrait' | 'landscape';
    language: string;
    voice?: string;
    showText: boolean;
    backgroundMusic: string;
    personalAudio?: string;
    defaultVideo?: string;
    skipReview?: boolean;
    textConfig?: JobTextConfig;
}

export interface StoredJobRequest {
    title: string;
    script: string;
    options: JobRequestOptions;
}

export interface JobStatus {
    id: string;
    title?: string;
    publicId?: string;
    status: JobState;
    phase: JobPhase;
    progress: number;
    message: string;
    outputPath?: string;
    error?: string;
    errorDetails?: string;
    startTime: number;
    updatedAt: number;
    endTime?: number;
    cancelRequested: boolean;
    retryCount: number;
    request?: StoredJobRequest;
}

const JOBS_FILE = resolveProjectPath('.mcp-jobs.json');

const VALID_JOB_STATES: JobState[] = ['pending', 'processing', 'awaiting_review', 'cancelling', 'cancelled', 'completed', 'failed'];
const VALID_JOB_PHASES: JobPhase[] = ['generate', 'review', 'render', 'completed'];

function isJobState(value: unknown): value is JobState {
    return typeof value === 'string' && VALID_JOB_STATES.includes(value as JobState);
}

function isJobPhase(value: unknown): value is JobPhase {
    return typeof value === 'string' && VALID_JOB_PHASES.includes(value as JobPhase);
}

function normalizeTextConfig(value: unknown): JobTextConfig | undefined {
    if (!value || typeof value !== 'object') {
        return undefined;
    }

    const raw = value as Record<string, unknown>;
    const textConfig: JobTextConfig = {};

    if (typeof raw.color === 'string') {
        textConfig.color = raw.color;
    }

    if (typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize)) {
        textConfig.fontSize = raw.fontSize;
    }

    if (raw.position === 'top' || raw.position === 'center' || raw.position === 'bottom') {
        textConfig.position = raw.position;
    }

    if (raw.animation === 'fade' || raw.animation === 'slide' || raw.animation === 'zoom' || raw.animation === 'typewriter' || raw.animation === 'pop') {
        textConfig.animation = raw.animation;
    }

    if (raw.background === 'none' || raw.background === 'box' || raw.background === 'glass') {
        textConfig.background = raw.background;
    }

    if (typeof raw.glow === 'boolean') {
        textConfig.glow = raw.glow;
    }

    return Object.keys(textConfig).length > 0 ? textConfig : undefined;
}

function normalizeRequest(value: unknown): StoredJobRequest | undefined {
    if (!value || typeof value !== 'object') {
        return undefined;
    }

    const raw = value as Record<string, unknown>;
    const optionsValue = raw.options;
    if (typeof raw.title !== 'string' || typeof raw.script !== 'string' || !optionsValue || typeof optionsValue !== 'object') {
        return undefined;
    }

    const options = optionsValue as Record<string, unknown>;
    return {
        title: raw.title,
        script: raw.script,
        options: {
            orientation: options.orientation === 'landscape' ? 'landscape' : 'portrait',
            language: typeof options.language === 'string' && options.language.trim().length > 0 ? options.language : 'english',
            voice: typeof options.voice === 'string' ? options.voice : undefined,
            showText: options.showText !== false,
            backgroundMusic: typeof options.backgroundMusic === 'string' ? options.backgroundMusic : '',
            personalAudio: typeof options.personalAudio === 'string' ? options.personalAudio : undefined,
            defaultVideo: typeof options.defaultVideo === 'string' ? options.defaultVideo : undefined,
            skipReview: options.skipReview === true,
            textConfig: normalizeTextConfig(options.textConfig),
        },
    };
}

function resolveJobOutputDir(job: Pick<JobStatus, 'publicId' | 'outputPath'>): string | null {
    if (job.publicId) {
        return resolveProjectPath('output', job.publicId);
    }

    if (job.outputPath) {
        return path.dirname(job.outputPath);
    }

    return null;
}

function hasSceneData(job: Pick<JobStatus, 'publicId' | 'outputPath'>): boolean {
    const outputDir = resolveJobOutputDir(job);
    return outputDir ? fs.existsSync(path.join(outputDir, 'scene-data.json')) : false;
}

function inferJobPhase(raw: Record<string, unknown>, status: JobState): JobPhase {
    if (isJobPhase(raw.phase)) {
        return raw.phase;
    }

    if (status === 'awaiting_review') {
        return 'review';
    }

    if (status === 'completed') {
        return 'completed';
    }

    const publicId = typeof raw.publicId === 'string' ? raw.publicId : undefined;
    const outputPath = typeof raw.outputPath === 'string' ? raw.outputPath : undefined;
    return hasSceneData({ publicId, outputPath }) ? 'render' : 'generate';
}

function normalizeJobRecord(value: unknown): JobStatus | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const raw = value as Record<string, unknown>;
    if (typeof raw.id !== 'string' || raw.id.trim().length === 0) {
        return null;
    }

    const status = isJobState(raw.status) ? raw.status : 'pending';
    const startTime = typeof raw.startTime === 'number' && Number.isFinite(raw.startTime) ? raw.startTime : Date.now();
    const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : typeof raw.endTime === 'number' && Number.isFinite(raw.endTime)
            ? raw.endTime
            : startTime;

    const job: JobStatus = {
        id: raw.id,
        title: typeof raw.title === 'string' ? raw.title : undefined,
        publicId: typeof raw.publicId === 'string' ? raw.publicId : undefined,
        status,
        phase: inferJobPhase(raw, status),
        progress: typeof raw.progress === 'number' && Number.isFinite(raw.progress) ? raw.progress : 0,
        message: typeof raw.message === 'string' && raw.message.length > 0 ? raw.message : 'Initializing...',
        outputPath: typeof raw.outputPath === 'string' ? raw.outputPath : undefined,
        error: typeof raw.error === 'string' ? raw.error : undefined,
        errorDetails: typeof raw.errorDetails === 'string' ? raw.errorDetails : undefined,
        startTime,
        updatedAt,
        endTime: typeof raw.endTime === 'number' && Number.isFinite(raw.endTime) ? raw.endTime : undefined,
        cancelRequested: raw.cancelRequested === true,
        retryCount: typeof raw.retryCount === 'number' && Number.isFinite(raw.retryCount) && raw.retryCount >= 0 ? Math.floor(raw.retryCount) : 0,
        request: normalizeRequest(raw.request),
    };

    return job;
}

export class JobStore {
    private jobs: Map<string, JobStatus> = new Map();

    constructor() {
        this.load();
        this.recoverInterruptedJobs();
    }

    private load() {
        if (fs.existsSync(JOBS_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
                if (Array.isArray(data)) {
                    for (const item of data) {
                        const job = normalizeJobRecord(item);
                        if (job) {
                            this.jobs.set(job.id, job);
                        }
                    }
                }
            } catch (e) {
                // Silently fail or log to stderr
            }
        }
    }

    private save() {
        try {
            const data = Array.from(this.jobs.values());
            const tempPath = `${JOBS_FILE}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
            fs.renameSync(tempPath, JOBS_FILE);
        } catch (e) {
            // Silently fail or log to stderr
        }
    }

    private recoverInterruptedJobs() {
        const now = Date.now();
        let changed = false;

        for (const [id, job] of this.jobs.entries()) {
            if (job.status !== 'pending' && job.status !== 'processing' && job.status !== 'cancelling') {
                continue;
            }

            const phase = job.phase === 'completed' ? 'render' : job.phase;
            const interruptedAt = job.updatedAt || job.startTime;
            const message = phase === 'render' && hasSceneData(job)
                ? 'Application restarted before rendering finished. Retry to continue.'
                : 'Application restarted before generation finished. Retry to continue.';

            this.jobs.set(id, {
                ...job,
                status: 'failed',
                phase,
                message,
                error: 'Job interrupted by application restart.',
                errorDetails: `Job was last updated at ${new Date(interruptedAt).toISOString()} before the process exited.`,
                cancelRequested: false,
                endTime: now,
                updatedAt: now,
            });
            changed = true;
        }

        if (changed) {
            this.save();
        }
    }

    public set(id: string, status: Partial<JobStatus>) {
        const existing = this.jobs.get(id) || {
            id,
            status: 'pending' as const,
            phase: 'generate' as const,
            progress: 0,
            message: 'Initializing...',
            startTime: Date.now(),
            updatedAt: Date.now(),
            cancelRequested: false,
            retryCount: 0,
        };

        const updated = {
            ...existing,
            ...status,
            updatedAt: typeof status.updatedAt === 'number' ? status.updatedAt : Date.now(),
        } as JobStatus;

        this.jobs.set(id, updated);
        this.save();
        return updated;
    }

    public get(id: string): JobStatus | undefined {
        return this.jobs.get(id);
    }

    public all(): JobStatus[] {
        return Array.from(this.jobs.values());
    }
}

export const jobStore = new JobStore();
