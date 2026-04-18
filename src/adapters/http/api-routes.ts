import { Router } from 'express';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from '../../constants/config';
import { asyncHandler, validateRequest } from '../../lib/validation';
import { requireLocalAccess } from '../../middleware/local-only';
import { createMemoryRateLimiter } from '../../middleware/rate-limit';
import * as AiController from './ai-controller';
import * as FilesController from './files-controller';
import * as JobsController from './jobs-controller';
import * as ScenesController from './scenes-controller';
import * as SetupController from './setup-controller';
import * as VideosController from './videos-controller';
import * as VideoDownloadController from './video-download-controller';
import * as SocialDownloadController from './social-download-controller';
import {
    assetFilenameParamsSchema,
    generateScriptBodySchema,
    jobIdParamsSchema,
    listFilesQuerySchema,
    pickFileBodySchema,
    refineSceneBodySchema,
    reorderScenesBodySchema,
    sceneParamsSchema,
    startJobBodySchema,
    updateEnvBodySchema,
    updateSceneBodySchema,
    videoIdParamsSchema,
    viewFileQuerySchema,
} from '../../schemas/api.schemas';

const router = Router();
const createJobLimiter = createMemoryRateLimiter({ keyPrefix: 'create-job', max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });
const aiLimiter = createMemoryRateLimiter({ keyPrefix: 'generate-script', max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });

router.get('/health', asyncHandler(SetupController.healthCheck));
router.get('/videos', asyncHandler(VideosController.getVideos));
router.get('/videos/:videoId', validateRequest({ params: videoIdParamsSchema }), asyncHandler(VideosController.getVideoById));
router.get('/voices', asyncHandler(AiController.getVoices));
router.get('/setup/status', asyncHandler(SetupController.getStatus));
router.post('/setup/env', requireLocalAccess, validateRequest({ body: updateEnvBodySchema }), asyncHandler(SetupController.updateEnv));
router.get('/jobs/:jobId', validateRequest({ params: jobIdParamsSchema }), asyncHandler(JobsController.getJobStatus));
router.get('/jobs/:jobId/scenes', validateRequest({ params: jobIdParamsSchema }), asyncHandler(ScenesController.getJobScenes));
router.post('/jobs/:jobId/scenes/reorder', validateRequest({ params: jobIdParamsSchema, body: reorderScenesBodySchema }), asyncHandler(ScenesController.reorderScenes));
router.post('/jobs/:jobId/scenes/:sceneIndex', validateRequest({ params: sceneParamsSchema, body: updateSceneBodySchema }), asyncHandler(ScenesController.updateJobScene));
router.delete('/jobs/:jobId/scenes/:sceneIndex', validateRequest({ params: sceneParamsSchema }), asyncHandler(ScenesController.deleteScene));
router.post('/jobs/:jobId/scenes/:sceneIndex/refine', validateRequest({ params: sceneParamsSchema, body: refineSceneBodySchema }), asyncHandler(ScenesController.refineSceneWithAI));
router.post('/jobs/:jobId/confirm', validateRequest({ params: jobIdParamsSchema }), asyncHandler(JobsController.confirmJobRender));
router.post('/jobs/:jobId/cancel', validateRequest({ params: jobIdParamsSchema }), asyncHandler(JobsController.cancelJobController));
router.post('/jobs/:jobId/retry', validateRequest({ params: jobIdParamsSchema }), asyncHandler(JobsController.retryJobController));
router.post('/jobs', createJobLimiter, validateRequest({ body: startJobBodySchema }), asyncHandler(JobsController.startJobController));
router.post('/ai/generate-script', aiLimiter, validateRequest({ body: generateScriptBodySchema }), asyncHandler(AiController.generateScriptAI));
router.post('/video-download/process', asyncHandler(VideoDownloadController.processDownloadRequest));
router.post('/social-download/process', asyncHandler(SocialDownloadController.processSocialDownloadRequest));
router.get('/fs/ls', requireLocalAccess, validateRequest({ query: listFilesQuerySchema }), asyncHandler(FilesController.listFiles));
router.post('/fs/pick', requireLocalAccess, validateRequest({ body: pickFileBodySchema }), asyncHandler(FilesController.pickFile));
router.get('/fs/drives', requireLocalAccess, asyncHandler(FilesController.listDrives));
router.get('/fs/home', requireLocalAccess, asyncHandler(FilesController.getHomeDirs));
router.get('/fs/assets', requireLocalAccess, asyncHandler(FilesController.listGalleryAssets));
router.delete('/fs/assets/:filename', requireLocalAccess, validateRequest({ params: assetFilenameParamsSchema }), asyncHandler(FilesController.deleteAsset));
router.get('/fs/view', requireLocalAccess, validateRequest({ query: viewFileQuerySchema }), asyncHandler(FilesController.viewFile));

export default router;
