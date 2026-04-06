import { Request, Response } from 'express';
import { pipelineAppService } from '../../application/pipeline-app.service';
import { setupService } from '../../application/setup.service';
import { mediaAppService } from '../../application/media-app.service';
import { jobStore } from '../../infrastructure/persistence/job-store';
import { EDITABLE_ENV_KEYS } from '../../constants/config';
import { isLocalRequest } from '../../middleware/local-only';
import { toEditableEnvUpdates } from './api-helpers';

export const healthCheck = (req: Request, res: Response) => {
    const health = pipelineAppService.getDiagnostics();
    const includeDetails = isLocalRequest(req) || process.env.EXPOSE_HEALTH_DETAILS === '1';
    const publishedVideos = mediaAppService.listPublishedVideos(req);

    res.json({
        status: health.overall,
        service: 'video-generator',
        publishedVideos: publishedVideos.length,
        jobsTracked: jobStore.all().length,
        ...(includeDetails ? { dependencies: health.checks, environment: health.environment } : {}),
    });
};

export const getStatus = (_req: Request, res: Response) => {
    res.json({ success: true, data: pipelineAppService.getSetupStatus() });
};

export const updateEnv = (req: Request, res: Response) => {
    const updated = setupService.updateEnvValues(toEditableEnvUpdates(req.body as Record<string, unknown>, EDITABLE_ENV_KEYS));
    res.json({ success: true, data: updated });
};
