import { Request, Response } from 'express';
import { pipelineAppService } from '../../application/pipeline-app.service';
import { setupService } from '../../application/setup.service';
import { mediaAppService } from '../../application/media-app.service';
import { jobStore } from '../../infrastructure/persistence/job-store';
import { EDITABLE_ENV_KEYS } from '../../constants/config';
import { isLocalRequest } from '../../middleware/local-only';
import { toEditableEnvUpdates } from './api-helpers';
import { bundledStatus } from '../../agentic/media/bundled-media';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';

export const healthCheck = (req: Request, res: Response) => {
    const health = pipelineAppService.getDiagnostics();
    const includeDetails = isLocalRequest(req) || process.env.EXPOSE_HEALTH_DETAILS === '1';
    const publishedVideos = mediaAppService.listPublishedVideos(req);

    // Production health check: include system metrics
    const bundled = bundledStatus();
    let diskFreeGB = 0;
    try {
        if (process.platform === 'win32') {
            const out = execSync('powershell -Command "(Get-PSDrive -Name C).Free / 1GB"', { encoding: 'utf8' });
            diskFreeGB = Math.round(parseFloat(out.trim()) * 10) / 10;
        } else {
            const out = execSync('df -BG . | tail -1 | awk \'{print $4}\'', { encoding: 'utf8' });
            diskFreeGB = parseInt(out.trim().replace('G', ''), 10);
        }
    } catch { /* ignore */ }

    let ffmpegVersion = 'unknown';
    try {
        const v = execSync('ffmpeg -version 2>&1 | head -1', { encoding: 'utf8' });
        ffmpegVersion = v.trim().split(' ')[2] || 'unknown';
    } catch { /* ignore */ }

    res.json({
        status: health.overall,
        service: 'video-generator',
        version: process.env.npm_package_version || '5.0.0',
        publishedVideos: publishedVideos.length,
        jobsTracked: jobStore.all().length,
        system: {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            uptimeSec: Math.round(process.uptime()),
            memoryUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            memoryTotalMB: Math.round(os.totalmem() / 1024 / 1024),
            diskFreeGB,
            ffmpegVersion,
        },
        offline: {
            available: bundled.images > 0 || bundled.videos > 0,
            bundledImages: bundled.images,
            bundledVideos: bundled.videos,
            bundledMusic: bundled.music,
        },
        ...(includeDetails ? { dependencies: health.checks, environment: health.environment } : {}),
    });
};

export const getStatus = (_req: Request, res: Response) => {
    res.json({ success: true, data: pipelineAppService.getSetupStatus() });
};

export const updateEnv = (req: Request, res: Response) => {
    const updated = setupService.updateEnvValues(
        toEditableEnvUpdates(req.body as Record<string, unknown>, EDITABLE_ENV_KEYS),
    );
    res.json({ success: true, data: updated });
};
