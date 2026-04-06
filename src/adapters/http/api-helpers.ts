import * as fs from 'fs';
import * as path from 'path';
import { EditableEnvKey } from '../../types/server.types';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { JobStatus } from '../../shared/contracts/job.contract';

export type JobGetter = (jobId: string) => JobStatus | undefined;
export type OutputPathResolver = (jobId: string) => string;

export function getJobOrThrow(jobId: string, getJob: JobGetter): JobStatus {
    const job = getJob(jobId);
    if (!job) {
        throw new NotFoundError('Job not found.');
    }

    return job;
}

export function getJobOutputDir(jobId: string, getJob: JobGetter, resolveProjectPath: (...segments: string[]) => string): string {
    const job = getJobOrThrow(jobId, getJob);
    if (job.publicId) {
        return resolveProjectPath('output', job.publicId);
    }

    if (job.outputPath) {
        return path.dirname(job.outputPath);
    }

    throw new NotFoundError('Job output directory not found.');
}

export function readJsonFile<T>(filePath: string, notFoundMessage: string): T {
    if (!fs.existsSync(filePath)) {
        throw new NotFoundError(notFoundMessage);
    }

    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
    } catch (error) {
        throw new BadRequestError('Failed to parse JSON data.', {
            filePath,
            reason: error instanceof Error ? error.message : 'Unknown parse error',
        });
    }
}

export function toSceneIndex(sceneIndex: string): number {
    const parsed = Number.parseInt(sceneIndex, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new BadRequestError('Invalid scene index.');
    }

    return parsed;
}

export function toEditableEnvUpdates(body: Record<string, unknown>, editableEnvKeys: readonly EditableEnvKey[]): Partial<Record<EditableEnvKey, string>> {
    const updates: Partial<Record<EditableEnvKey, string>> = {};
    for (const key of editableEnvKeys) {
        const value = body[key];
        if (typeof value === 'string' && value.length > 0) {
            updates[key] = value;
        }
    }

    return updates;
}

export function resolveContentType(extension: string): string | null {
    const lookup: Record<string, string> = {
        '.gif': 'image/gif',
        '.jpeg': 'image/jpeg',
        '.jpg': 'image/jpeg',
        '.m4a': 'audio/mp4',
        '.mov': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.mp4': 'video/mp4',
        '.ogg': 'audio/ogg',
        '.png': 'image/png',
        '.wav': 'audio/wav',
        '.webm': 'video/webm',
        '.webp': 'image/webp',
    };

    return lookup[extension] || null;
}
