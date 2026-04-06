import { Router } from 'express';
import * as ApiController from '../controllers/api.controller';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from '../constants/config';
import { asyncHandler, validateRequest } from '../lib/validation';
import { requireLocalAccess } from '../middleware/local-only';
import { createMemoryRateLimiter } from '../middleware/rate-limit';
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
} from '../schemas/api.schemas';

const router = Router();
const createJobLimiter = createMemoryRateLimiter({
    keyPrefix: 'create-job',
    max: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
});
const aiLimiter = createMemoryRateLimiter({
    keyPrefix: 'generate-script',
    max: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
});

router.get('/health', asyncHandler(ApiController.healthCheck));
router.get('/videos', asyncHandler(ApiController.getVideos));
router.get('/videos/:videoId', validateRequest({ params: videoIdParamsSchema }), asyncHandler(ApiController.getVideoById));
router.get('/voices', asyncHandler(ApiController.getVoices));
router.get('/setup/status', asyncHandler(ApiController.getStatus));
router.post('/setup/env', requireLocalAccess, validateRequest({ body: updateEnvBodySchema }), asyncHandler(ApiController.updateEnv));
router.get('/jobs/:jobId', validateRequest({ params: jobIdParamsSchema }), asyncHandler(ApiController.getJobStatus));
router.get('/jobs/:jobId/scenes', validateRequest({ params: jobIdParamsSchema }), asyncHandler(ApiController.getJobScenes));
router.post(
    '/jobs/:jobId/scenes/reorder',
    validateRequest({ params: jobIdParamsSchema, body: reorderScenesBodySchema }),
    asyncHandler(ApiController.reorderScenes),
);
router.post(
    '/jobs/:jobId/scenes/:sceneIndex',
    validateRequest({ params: sceneParamsSchema, body: updateSceneBodySchema }),
    asyncHandler(ApiController.updateJobScene),
);
router.delete(
    '/jobs/:jobId/scenes/:sceneIndex',
    validateRequest({ params: sceneParamsSchema }),
    asyncHandler(ApiController.deleteScene),
);
router.post(
    '/jobs/:jobId/scenes/:sceneIndex/refine',
    validateRequest({ params: sceneParamsSchema, body: refineSceneBodySchema }),
    asyncHandler(ApiController.refineSceneWithAI),
);
router.post('/jobs/:jobId/confirm', validateRequest({ params: jobIdParamsSchema }), asyncHandler(ApiController.confirmJobRender));
router.post('/jobs/:jobId/cancel', validateRequest({ params: jobIdParamsSchema }), asyncHandler(ApiController.cancelJobController));
router.post('/jobs/:jobId/retry', validateRequest({ params: jobIdParamsSchema }), asyncHandler(ApiController.retryJobController));
router.post('/jobs', createJobLimiter, validateRequest({ body: startJobBodySchema }), asyncHandler(ApiController.startJobController));
router.post(
    '/ai/generate-script',
    aiLimiter,
    validateRequest({ body: generateScriptBodySchema }),
    asyncHandler(ApiController.generateScriptAI),
);

router.get('/fs/ls', requireLocalAccess, validateRequest({ query: listFilesQuerySchema }), asyncHandler(ApiController.listFiles));
router.post('/fs/pick', requireLocalAccess, validateRequest({ body: pickFileBodySchema }), asyncHandler(ApiController.pickFile));
router.get('/fs/drives', requireLocalAccess, asyncHandler(ApiController.listDrives));
router.get('/fs/home', requireLocalAccess, asyncHandler(ApiController.getHomeDirs));
router.get('/fs/assets', requireLocalAccess, asyncHandler(ApiController.listGalleryAssets));
router.delete(
    '/fs/assets/:filename',
    requireLocalAccess,
    validateRequest({ params: assetFilenameParamsSchema }),
    asyncHandler(ApiController.deleteAsset),
);
router.get('/fs/view', requireLocalAccess, validateRequest({ query: viewFileQuerySchema }), asyncHandler(ApiController.viewFile));

export default router;
