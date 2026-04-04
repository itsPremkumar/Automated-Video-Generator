import * as fs from 'fs';
import * as path from 'path';
import { Request, Response } from 'express';
import { jobStore, resolveProjectPath } from '../runtime';
import { 
    listVideos, 
    getVideo, 
    publicVideo, 
    getJobData, 
    sanitizeFolderTitle, 
    absoluteUrl 
} from '../services/video.service';
import { getSetupStatus, updateEnvValues, normalizeEnvValue } from '../services/env.service';
import { getDynamicVoices } from '../lib/voice-generator';
import { createAndRunJob } from '../services/job.service';
import { EDITABLE_ENV_KEYS, DEFAULT_FALLBACK_VIDEO } from '../constants/config';
import { EditableEnvKey } from '../types/server.types';

export const healthCheck = (req: Request, res: Response) => {
    res.json({ 
        status: 'ok', 
        service: 'video-generator', 
        publishedVideos: listVideos(req).length, 
        jobsTracked: jobStore.all().length 
    });
};

export const getVideos = (req: Request, res: Response) => {
    res.json({ success: true, data: listVideos(req).map(publicVideo) });
};

export const getVideoById = (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video) {
        res.status(404).json({ success: false, error: 'Video not found.' });
        return;
    }
    res.json({ success: true, data: publicVideo(video) });
};

export const getVoices = (req: Request, res: Response) => {
    try {
        const voices = getDynamicVoices();
        res.json({ success: true, data: voices });
    } catch (error: any) {
        res.status(500).json({ success: false, error: 'Failed to fetch voices' });
    }
};

export const getStatus = (req: Request, res: Response) => {
    res.json({ success: true, data: getSetupStatus() });
};

export const updateEnv = (req: Request, res: Response) => {
    try {
        const updates: Partial<Record<EditableEnvKey, string>> = {};
        for (const key of EDITABLE_ENV_KEYS) {
            if (key in (req.body || {})) {
                updates[key] = normalizeEnvValue(req.body?.[key]);
            }
        }
        updateEnvValues(updates);
        res.json({ success: true, data: getSetupStatus() });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error?.message || 'Unable to save setup.' });
    }
};

export const getJobStatus = (req: Request, res: Response) => {
    const jobId = String(req.params.jobId);
    const job = jobStore.get(jobId);
    if (!job) {
        res.status(404).json({ success: false, error: 'Job not found.' });
        return;
    }
    res.json({ success: true, data: getJobData(job, req) });
};

export const startJobController = async (req: Request, res: Response) => {
    const { title, script, orientation, language, voice, backgroundMusic, defaultVideo, showText } = req.body;
    
    const publicId = `${sanitizeFolderTitle(title) || 'video'}_${Date.now()}`;
    const jobId = `job_${Date.now()}_${title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'video'}`;

    await createAndRunJob(jobId, publicId, title, script, {
        orientation,
        language,
        voice,
        backgroundMusic,
        defaultVideo: defaultVideo || DEFAULT_FALLBACK_VIDEO,
        showText: showText !== false
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
    const queryPath = String(req.query.path || process.cwd());
    try {
        if (!fs.existsSync(queryPath)) {
            res.status(404).json({ success: false, error: 'Path not found' });
            return;
        }

        const stats = fs.statSync(queryPath);
        if (!stats.isDirectory()) {
            res.status(400).json({ success: false, error: 'Not a directory' });
            return;
        }

        const items = fs.readdirSync(queryPath, { withFileTypes: true })
            .map(item => ({
                name: item.name,
                isDir: item.isDirectory(),
                path: path.join(queryPath, item.name),
                ext: path.extname(item.name).toLowerCase()
            }))
            .sort((a, b) => {
                if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

        res.json({
            success: true,
            data: {
                currentPath: queryPath,
                parentPath: path.dirname(queryPath),
                items
            }
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const pickFile = (req: Request, res: Response) => {
    const { sourcePath, type } = req.body;
    if (!sourcePath || !fs.existsSync(sourcePath)) {
        res.status(400).json({ success: false, error: 'Invalid source path' });
        return;
    }

    try {
        const filename = path.basename(sourcePath);
        const targetDir = type === 'music' 
            ? resolveProjectPath('input', 'music') 
            : resolveProjectPath('input', 'input-assests');
        
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const targetPath = path.join(targetDir, filename);
        fs.copyFileSync(sourcePath, targetPath);

        res.json({ 
            success: true, 
            data: { 
                filename, 
                targetPath,
                tag: type === 'music' ? filename : `[Visual: ${filename}]`
            } 
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const listDrives = (req: Request, res: Response) => {
    if (process.platform !== 'win32') {
        res.json({ success: true, data: ['/'] });
        return;
    }

    const { exec } = require('child_process');
    exec('powershell "get-psdrive -psprovider filesystem | select -expand name"', (err: any, stdout: string) => {
        if (err) {
            const drives = [];
            for (let i = 65; i <= 90; i++) {
                const drive = String.fromCharCode(i) + ':';
                if (fs.existsSync(drive + '\\')) drives.push(drive);
            }
            res.json({ success: true, data: drives });
            return;
        }

        const drives = stdout.split(/\r?\n/).map(s => s.trim()).filter(s => s.length === 1).map(s => s + ':');
        res.json({ success: true, data: drives });
    });
};

export const getHomeDirs = (req: Request, res: Response) => {
    const home = process.env.USERPROFILE || process.env.HOME || process.cwd();
    res.json({
        success: true,
        data: {
            home,
            desktop: path.join(home, 'Desktop'),
            documents: path.join(home, 'Documents'),
            downloads: path.join(home, 'Downloads'),
            pictures: path.join(home, 'Pictures'),
            videos: path.join(home, 'Videos')
        }
    });
};
