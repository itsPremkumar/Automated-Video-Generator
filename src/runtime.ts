import * as path from 'path';
import * as fs from 'fs';
import { format } from 'util';

export const projectRoot = path.resolve(__dirname, '..');

export function resolveProjectPath(...segments: string[]): string {
  return path.join(projectRoot, ...segments);
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

export interface JobStatus {
    id: string;
    title?: string;
    publicId?: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    message: string;
    outputPath?: string;
    error?: string;
    startTime: number;
    endTime?: number;
}

const JOBS_FILE = resolveProjectPath('.mcp-jobs.json');

export class JobStore {
    private jobs: Map<string, JobStatus> = new Map();

    constructor() {
        this.load();
    }

    private load() {
        if (fs.existsSync(JOBS_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
                if (Array.isArray(data)) {
                    for (const job of data) {
                        this.jobs.set(job.id, job);
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
            fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2));
        } catch (e) {
            // Silently fail or log to stderr
        }
    }

    public set(id: string, status: Partial<JobStatus>) {
        const existing = this.jobs.get(id) || {
            id,
            status: 'pending' as const,
            progress: 0,
            message: 'Initializing...',
            startTime: Date.now(),
        };

        const updated = { ...existing, ...status } as JobStatus;
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
