import { Request, Response } from 'express';
import { pipelineAppService } from '../../application/pipeline-app.service';
import { mediaAppService } from '../../application/media-app.service';
import { jobStore } from '../../infrastructure/persistence/job-store';
import { getRequestLogger } from '../../middleware/request-context';
import { PipelineJobRequest } from '../../shared/contracts/job.contract';
import { getJobOrThrow } from './api-helpers';

export const getJobStatus = (req: Request, res: Response) => {
    const job = getJobOrThrow(String(req.params.jobId), (id) => jobStore.get(id));
    res.json({ success: true, data: mediaAppService.buildJobResponse(job, req) });
};

export const confirmJobRender = async (req: Request, res: Response) => {
    const result = await pipelineAppService.continueJobToRender(String(req.params.jobId));
    res.json({ success: true, data: result, message: result.alreadyQueued ? 'Render is already queued or running.' : 'Render queued.' });
};

export const cancelJobController = async (req: Request, res: Response) => {
    const result = await pipelineAppService.cancelJob(String(req.params.jobId));
    res.json({ success: true, data: result, message: result.completed ? 'Job cancelled.' : 'Cancellation requested. The job will stop after the current safe checkpoint.' });
};

export const retryJobController = async (req: Request, res: Response) => {
    const result = await pipelineAppService.retryJob(String(req.params.jobId));
    const message = result.alreadyQueued ? 'Retry is already queued or running.' : result.mode === 'review' ? 'Job restored to the review stage.' : result.mode === 'render' ? 'Render retry queued.' : 'Generation retry queued.';
    res.json({ success: true, data: result, message });
};

export const startJobController = async (req: Request, res: Response) => {
    const logger = getRequestLogger(res);
    const request = req.body as PipelineJobRequest;
    const result = await pipelineAppService.createJob(request);
    logger.info('job.created', { jobId: result.jobId, orientation: request.orientation, publicId: result.publicId, skipReview: !!request.skipReview, title: request.title });
    res.status(202).json({ success: true, data: { ...result, ...mediaAppService.buildJobLinks(result.jobId, req) } });
};
