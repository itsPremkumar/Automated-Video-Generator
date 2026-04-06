import * as fs from 'fs';
import * as path from 'path';
import { Request } from 'express';
import { OUTPUT_ROOT } from '../constants/config';
import { VideoRecord } from '../types/server.types';
import { JobStatus } from '../shared/contracts/job.contract';
import { resolveProjectPath } from '../shared/runtime/paths';

function relativeUrl(pathname: string): string {
    return pathname;
}

export function sanitizeFolderTitle(value: string): string {
    return value
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 50);
}

export function safePublicId(publicId: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(publicId);
}

export function outputFolder(publicId: string): string | null {
    if (!safePublicId(publicId)) {
        return null;
    }

    const folder = path.join(OUTPUT_ROOT, publicId);
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
        return null;
    }

    return folder;
}

export function findVideoFile(folder: string): string | null {
    const files = fs.readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.mp4') && !name.startsWith('segment'));
    return files[0] || null;
}

export function readSceneData(folder: string): { orientation: string; durationSeconds: number | null } {
    const file = path.join(folder, 'scene-data.json');
    if (!fs.existsSync(file)) {
        return { orientation: 'unknown', durationSeconds: null };
    }

    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        return {
            orientation: data.orientation === 'landscape' ? 'landscape' : data.orientation === 'portrait' ? 'portrait' : 'unknown',
            durationSeconds: typeof data.totalDuration === 'number' ? data.totalDuration : null,
        };
    } catch {
        return { orientation: 'unknown', durationSeconds: null };
    }
}

export function readDescription(folder: string): string | null {
    const file = fs.readdirSync(folder).find((name) => name.toLowerCase().endsWith('.txt'));
    if (!file) {
        return null;
    }

    const text = fs.readFileSync(path.join(folder, file), 'utf8').trim();
    return text.length > 0 ? text : null;
}

export function getVideo(publicId: string, req: Request): VideoRecord | null {
    const folder = outputFolder(publicId);
    if (!folder) {
        return null;
    }

    const videoFilename = findVideoFile(folder);
    if (!videoFilename) {
        return null;
    }

    const videoPath = path.join(folder, videoFilename);
    const stats = fs.statSync(videoPath);
    
    if (stats.size === 0) {
        return null;
    }

    const thumbnailPath = path.join(folder, 'thumbnail.jpg');
    const scene = readSceneData(folder);

    return {
        id: publicId,
        title: path.basename(videoFilename, path.extname(videoFilename)).replace(/_/g, ' '),
        createdAt: new Date(stats.mtimeMs).toISOString(),
        orientation: scene.orientation,
        durationSeconds: scene.durationSeconds,
        description: readDescription(folder),
        fileSizeMB: (stats.size / (1024 * 1024)).toFixed(2),
        videoFilename,
        videoPath,
        thumbnailPath: fs.existsSync(thumbnailPath) ? thumbnailPath : null,
        watchUrl: relativeUrl(`/videos/${encodeURIComponent(publicId)}`),
        downloadUrl: relativeUrl(`/download/${encodeURIComponent(publicId)}`),
        videoUrl: relativeUrl(`/files/${encodeURIComponent(publicId)}/video`),
        thumbnailUrl: fs.existsSync(thumbnailPath) ? relativeUrl(`/files/${encodeURIComponent(publicId)}/thumbnail`) : null,
    };
}

export function listMusicFiles(): string[] {
    const musicDir = resolveProjectPath('input', 'music');
    if (!fs.existsSync(musicDir)) {
        return [];
    }

    return fs.readdirSync(musicDir).filter((name) => name.toLowerCase().endsWith('.mp3'));
}

export function listVideos(req: Request): VideoRecord[] {
    if (!fs.existsSync(OUTPUT_ROOT)) {
        return [];
    }

    return fs.readdirSync(OUTPUT_ROOT)
        .map((name) => getVideo(name, req))
        .filter((video): video is VideoRecord => Boolean(video))
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function publicVideo(video: VideoRecord) {
    return {
        id: video.id,
        title: video.title,
        createdAt: video.createdAt,
        orientation: video.orientation,
        durationSeconds: video.durationSeconds,
        description: video.description,
        fileSizeMB: video.fileSizeMB,
        watchUrl: video.watchUrl,
        downloadUrl: video.downloadUrl,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
    };
}

export function getJobData(job: JobStatus, req: Request) {
    const publicId = job.publicId || (job.outputPath ? path.basename(path.dirname(job.outputPath)) : null);
    const isTerminal = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled';
    const data: Record<string, unknown> = {
        jobId: job.id,
        title: job.title || null,
        publicId,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        message: job.message,
        error: job.error || null,
        errorDetails: job.errorDetails || null,
        startedAt: new Date(job.startTime).toISOString(),
        updatedAt: new Date(job.updatedAt).toISOString(),
        finishedAt: job.endTime ? new Date(job.endTime).toISOString() : null,
        cancelRequested: job.cancelRequested,
        retryCount: job.retryCount,
        canCancel: !isTerminal && job.status !== 'cancelling',
        canRetry: job.status === 'failed' || job.status === 'cancelled',
        isTerminal,
        statusUrl: relativeUrl(`/api/jobs/${encodeURIComponent(job.id)}`),
        statusPageUrl: relativeUrl(`/jobs/${encodeURIComponent(job.id)}`),
    };

    if (publicId) {
        data.watchUrl = relativeUrl(`/videos/${encodeURIComponent(publicId)}`);
        data.downloadUrl = relativeUrl(`/download/${encodeURIComponent(publicId)}`);
    }

    if (publicId && job.status === 'completed') {
        const video = getVideo(publicId, req);
        if (video) {
            data.video = publicVideo(video);
            data.watchUrl = video.watchUrl;
            data.downloadUrl = video.downloadUrl;
            data.videoUrl = video.videoUrl;
        }
    }

    return data;
}
