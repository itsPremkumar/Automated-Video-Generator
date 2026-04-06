import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { Request, Response } from 'express';
import { jobStore, resolveProjectPath } from '../runtime';
import {
    absoluteUrl,
    getJobData,
    getVideo,
    listVideos,
    publicVideo,
    sanitizeFolderTitle,
} from '../services/video.service';
import { getSetupStatus, updateEnvValues } from '../services/env.service';
import { getDynamicVoices } from '../lib/voice-generator';
import { generateScriptFromPrompt, refineSceneAI } from '../services/ai.service';
import { deleteJobScene, reorderJobScenes, updateSceneInJob } from '../video-generator';
import { cancelJob, continueJobToRender, createAndRunJob, retryJob } from '../services/job.service';
import { DEFAULT_FALLBACK_VIDEO, EDITABLE_ENV_KEYS } from '../constants/config';
import { EditableEnvKey } from '../types/server.types';
import { runHealthCheck } from '../services/health.service';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { buildUniqueFilePath, ensureAllowedExtension, INPUT_ASSET_ROOT, INPUT_MUSIC_ROOT, resolveAssetPath } from '../lib/path-safety';
import { isLocalRequest } from '../middleware/local-only';
import { getRequestLogger } from '../middleware/request-context';

const execAsync = promisify(exec);
const MAX_DIRECTORY_ITEMS = 500;

type SceneDataFile = {
    scenes: any[];
};

function getJobOrThrow(jobId: string) {
    const job = jobStore.get(jobId);
    if (!job) {
        throw new NotFoundError('Job not found.');
    }

    return job;
}

function getJobOutputDir(jobId: string): string {
    const job = getJobOrThrow(jobId);
    if (job.publicId) {
        return resolveProjectPath('output', job.publicId);
    }

    if (job.outputPath) {
        return path.dirname(job.outputPath);
    }

    throw new NotFoundError('Job output directory not found.');
}

function readJsonFile<T>(filePath: string, notFoundMessage: string): T {
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

function toSceneIndex(sceneIndex: string): number {
    const parsed = Number.parseInt(sceneIndex, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new BadRequestError('Invalid scene index.');
    }

    return parsed;
}

function toEditableEnvUpdates(body: Record<string, unknown>): Partial<Record<EditableEnvKey, string>> {
    const updates: Partial<Record<EditableEnvKey, string>> = {};
    for (const key of EDITABLE_ENV_KEYS) {
        const value = body[key];
        if (typeof value === 'string' && value.length > 0) {
            updates[key] = value;
        }
    }

    return updates;
}

function resolveContentType(extension: string): string | null {
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

export const healthCheck = (req: Request, res: Response) => {
    const health = runHealthCheck();
    const includeDetails = isLocalRequest(req) || process.env.EXPOSE_HEALTH_DETAILS === '1';

    res.json({
        status: health.overall,
        service: 'video-generator',
        publishedVideos: listVideos(req).length,
        jobsTracked: jobStore.all().length,
        ...(includeDetails ? {
            dependencies: health.checks,
            environment: health.environment,
        } : {}),
    });
};

export const getVideos = (req: Request, res: Response) => {
    res.json({ success: true, data: listVideos(req).map(publicVideo) });
};

export const getVideoById = (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video) {
        throw new NotFoundError('Video not found.');
    }

    res.json({ success: true, data: publicVideo(video) });
};

export const getVoices = (_req: Request, res: Response) => {
    const voices = getDynamicVoices();
    res.json({ success: true, data: voices });
};

export const getStatus = (_req: Request, res: Response) => {
    res.json({ success: true, data: getSetupStatus() });
};

export const updateEnv = (req: Request, res: Response) => {
    const updates = toEditableEnvUpdates(req.body as Record<string, unknown>);
    updateEnvValues(updates);
    res.json({ success: true, data: getSetupStatus() });
};

export const getJobStatus = (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const job = getJobOrThrow(jobId);
    res.json({ success: true, data: getJobData(job, req) });
};

export const getJobScenes = (req: Request, res: Response) => {
    const outputDir = getJobOutputDir(String(req.params.jobId));
    const data = readJsonFile<SceneDataFile>(path.join(outputDir, 'scene-data.json'), 'Scene data not found.');
    res.json({ success: true, data: data.scenes });
};

export const updateJobScene = async (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    getJobOrThrow(jobId);

    const updatedScene = await updateSceneInJob(
        getJobOutputDir(jobId),
        toSceneIndex(String(req.params.sceneIndex)),
        req.body,
    );

    res.json({ success: true, data: updatedScene });
};

export const reorderScenes = async (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    getJobOrThrow(jobId);

    const { fromIndex, toIndex } = req.body as { fromIndex: number; toIndex: number };
    const scenes = await reorderJobScenes(getJobOutputDir(jobId), fromIndex, toIndex);
    res.json({ success: true, data: scenes });
};

export const deleteScene = async (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    getJobOrThrow(jobId);

    const scenes = await deleteJobScene(
        getJobOutputDir(jobId),
        toSceneIndex(String(req.params.sceneIndex)),
    );

    res.json({ success: true, data: scenes });
};

export const refineSceneWithAI = async (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const outputDir = getJobOutputDir(jobId);
    const sceneIndex = toSceneIndex(String(req.params.sceneIndex));
    const { instruction } = req.body as { instruction: string };
    const data = readJsonFile<SceneDataFile>(path.join(outputDir, 'scene-data.json'), 'Scene data not found.');
    const scene = data.scenes[sceneIndex];

    if (!scene) {
        throw new NotFoundError('Scene not found.');
    }

    const refined = await refineSceneAI(scene.voiceoverText, scene.searchKeywords, instruction);
    const updatedScene = await updateSceneInJob(outputDir, sceneIndex, refined);

    res.json({ success: true, data: updatedScene });
};

export const confirmJobRender = async (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const result = await continueJobToRender(jobId);

    res.json({
        success: true,
        data: result,
        message: result.alreadyQueued ? 'Render is already queued or running.' : 'Render queued.',
    });
};

export const cancelJobController = async (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const result = await cancelJob(jobId);

    res.json({
        success: true,
        data: result,
        message: result.completed
            ? 'Job cancelled.'
            : 'Cancellation requested. The job will stop after the current safe checkpoint.',
    });
};

export const retryJobController = async (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const result = await retryJob(jobId);

    const message = result.alreadyQueued
        ? 'Retry is already queued or running.'
        : result.mode === 'review'
            ? 'Job restored to the review stage.'
            : result.mode === 'render'
                ? 'Render retry queued.'
                : 'Generation retry queued.';

    res.json({
        success: true,
        data: result,
        message,
    });
};

export const startJobController = async (req: Request, res: Response) => {
    const logger = getRequestLogger(res);
    const {
        title,
        script,
        orientation,
        language,
        voice,
        backgroundMusic,
        defaultVideo,
        showText,
        textConfig,
        personalAudio,
        skipReview,
    } = req.body as {
        title: string;
        script: string;
        orientation: 'portrait' | 'landscape';
        language?: string;
        voice?: string;
        backgroundMusic?: string;
        defaultVideo?: string;
        showText?: boolean;
        textConfig?: Record<string, unknown>;
        personalAudio?: string;
        skipReview?: boolean;
    };

    const slug = sanitizeFolderTitle(title) || 'video';
    const publicId = `${slug}_${Date.now()}`;
    const jobId = `job_${Date.now()}_${slug.replace(/_/g, '').slice(0, 12) || 'video'}`;

    await createAndRunJob(jobId, publicId, title, script, {
        orientation,
        language: language || 'english',
        voice,
        backgroundMusic: backgroundMusic || '',
        personalAudio,
        defaultVideo: defaultVideo || DEFAULT_FALLBACK_VIDEO,
        showText: showText !== false,
        textConfig,
        skipReview: !!skipReview,
    });

    logger.info('job.created', {
        jobId,
        orientation,
        publicId,
        skipReview: !!skipReview,
        title,
    });

    res.status(202).json({
        success: true,
        data: {
            jobId,
            title,
            publicId,
            statusUrl: absoluteUrl(req, `/api/jobs/${encodeURIComponent(jobId)}`),
            statusPageUrl: absoluteUrl(req, `/jobs/${encodeURIComponent(jobId)}`),
        },
    });
};

export const listFiles = (req: Request, res: Response) => {
    const queryPath = req.query.path ? path.resolve(String(req.query.path)) : process.cwd();
    if (!fs.existsSync(queryPath)) {
        throw new NotFoundError('Path not found.');
    }

    const stats = fs.statSync(queryPath);
    if (!stats.isDirectory()) {
        throw new BadRequestError('Not a directory.');
    }

    const entries = fs.readdirSync(queryPath, { withFileTypes: true });
    const truncated = entries.length > MAX_DIRECTORY_ITEMS;
    const items = entries
        .map((entry) => ({
            name: entry.name,
            isDir: entry.isDirectory(),
            path: path.join(queryPath, entry.name),
            ext: path.extname(entry.name).toLowerCase(),
        }))
        .sort((left, right) => {
            if (left.isDir !== right.isDir) {
                return left.isDir ? -1 : 1;
            }
            return left.name.localeCompare(right.name);
        })
        .slice(0, MAX_DIRECTORY_ITEMS);

    res.json({
        success: true,
        data: {
            currentPath: queryPath,
            parentPath: path.dirname(queryPath),
            items,
            totalItems: entries.length,
            truncated,
        },
    });
};

export const pickFile = (req: Request, res: Response) => {
    const { sourcePath, type } = req.body as {
        sourcePath: string;
        type: 'asset' | 'media' | 'music' | 'personalAudio';
    };

    if (!fs.existsSync(sourcePath)) {
        throw new NotFoundError('Source file not found.');
    }

    const stats = fs.statSync(sourcePath);
    if (!stats.isFile()) {
        throw new BadRequestError('Source path must point to a file.');
    }

    const filename = path.basename(sourcePath);
    const mediaType = type === 'music' || type === 'personalAudio' ? 'audio' : 'visual';
    const targetDir = mediaType === 'audio' ? INPUT_MUSIC_ROOT : INPUT_ASSET_ROOT;
    const allowedExtensions = mediaType === 'audio'
        ? ['.m4a', '.mp3', '.wav']
        : ['.gif', '.jpeg', '.jpg', '.mov', '.mp4', '.png', '.webm', '.webp'];

    ensureAllowedExtension(filename, allowedExtensions);

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = buildUniqueFilePath(targetDir, filename);
    fs.copyFileSync(sourcePath, targetPath);

    const savedFilename = path.basename(targetPath);
    const folderName = mediaType === 'audio' ? 'music' : 'input-assests';

    res.json({
        success: true,
        data: {
            filename: savedFilename,
            targetPath,
            assetUrl: `/assets/input/${folderName}/${encodeURIComponent(savedFilename)}`,
            tag: mediaType === 'audio' ? savedFilename : `[Visual: ${savedFilename}]`,
        },
    });
};

export const listGalleryAssets = (_req: Request, res: Response) => {
    if (!fs.existsSync(INPUT_ASSET_ROOT)) {
        res.json({ success: true, data: [] });
        return;
    }

    const items = fs.readdirSync(INPUT_ASSET_ROOT, { withFileTypes: true })
        .filter((entry) => !entry.isDirectory())
        .map((entry) => ({
            filename: entry.name,
            assetUrl: `/assets/input/input-assests/${encodeURIComponent(entry.name)}`,
            tag: `[Visual: ${entry.name}]`,
        }))
        .sort((left, right) => left.filename.localeCompare(right.filename));

    res.json({ success: true, data: items });
};

export const deleteAsset = (req: Request, res: Response) => {
    const filePath = resolveAssetPath(String(req.params.filename));
    if (!fs.existsSync(filePath)) {
        throw new NotFoundError('Asset not found.');
    }

    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Asset deleted successfully.' });
};

export const viewFile = (req: Request, res: Response) => {
    const rawPath = String(req.query.path);
    const filePath = path.isAbsolute(rawPath)
        ? path.resolve(rawPath)
        : resolveProjectPath('public', rawPath);

    if (!fs.existsSync(filePath)) {
        throw new NotFoundError('File not found.');
    }

    const extension = path.extname(filePath).toLowerCase();
    const allowedExtensions = ['.gif', '.jpeg', '.jpg', '.m4a', '.mov', '.mp3', '.mp4', '.ogg', '.png', '.wav', '.webm', '.webp'];
    ensureAllowedExtension(filePath, allowedExtensions);

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
        throw new BadRequestError('Not a file.');
    }

    const contentType = resolveContentType(extension);
    const streamable = ['.m4a', '.mov', '.mp3', '.mp4', '.ogg', '.wav', '.webm'].includes(extension);
    const range = req.headers.range;

    if (range && streamable) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        if (!match) {
            throw new BadRequestError('Invalid range header.');
        }

        const start = match[1] ? Number.parseInt(match[1], 10) : 0;
        const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= stat.size) {
            throw new BadRequestError('Invalid range header.');
        }

        const stream = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': contentType || 'application/octet-stream',
        });
        stream.pipe(res);
        return;
    }

    if (contentType) {
        res.setHeader('Content-Type', contentType);
    }

    res.sendFile(filePath);
};

export const listDrives = async (_req: Request, res: Response) => {
    if (process.platform !== 'win32') {
        res.json({ success: true, data: ['/'] });
        return;
    }

    try {
        const { stdout } = await execAsync('powershell "get-psdrive -psprovider filesystem | select -expand name"');
        const drives = stdout
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter((value) => value.length === 1)
            .map((value) => `${value}:`);

        res.json({ success: true, data: drives });
    } catch {
        const drives: string[] = [];
        for (let code = 65; code <= 90; code += 1) {
            const drive = `${String.fromCharCode(code)}:`;
            if (fs.existsSync(`${drive}\\`)) {
                drives.push(drive);
            }
        }

        res.json({ success: true, data: drives });
    }
};

export const getHomeDirs = (_req: Request, res: Response) => {
    const home = process.env.USERPROFILE || process.env.HOME || process.cwd();
    res.json({
        success: true,
        data: {
            home,
            desktop: path.join(home, 'Desktop'),
            documents: path.join(home, 'Documents'),
            downloads: path.join(home, 'Downloads'),
            pictures: path.join(home, 'Pictures'),
            videos: path.join(home, 'Videos'),
        },
    });
};

export const generateScriptAI = async (req: Request, res: Response) => {
    const { prompt } = req.body as { prompt: string };
    const result = await generateScriptFromPrompt(prompt);
    res.json({ success: true, data: result });
};
