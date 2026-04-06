import { Router } from 'express';
import * as ApiController from '../controllers/api.controller';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from '../constants/config';

// Simple rate limiter implementation same as in original server.ts
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function rateLimiter(req: any, res: any, next: any) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        next();
        return;
    }

    if (record.count >= RATE_LIMIT_MAX) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        res.set('Retry-After', String(retryAfter));
        res.status(429).json({ success: false, error: 'Too many requests', retryAfter });
        return;
    }

    record.count += 1;
    next();
}

const router = Router();

router.get('/health', ApiController.healthCheck);
router.get('/videos', ApiController.getVideos);
router.get('/videos/:videoId', ApiController.getVideoById);
router.get('/voices', ApiController.getVoices);
router.get('/setup/status', ApiController.getStatus);
router.post('/setup/env', ApiController.updateEnv);
router.get('/jobs/:jobId', ApiController.getJobStatus);
router.get('/jobs/:jobId/scenes', ApiController.getJobScenes);
router.post('/jobs/:jobId/scenes/reorder', ApiController.reorderScenes);
router.post('/jobs/:jobId/scenes/:sceneIndex', ApiController.updateJobScene);
router.delete('/jobs/:jobId/scenes/:sceneIndex', ApiController.deleteScene);
router.post('/jobs/:jobId/scenes/:sceneIndex/refine', ApiController.refineSceneWithAI);
router.post('/jobs/:jobId/confirm', ApiController.confirmJobRender);
router.post('/jobs', rateLimiter, ApiController.startJobController);
router.post('/ai/generate-script', rateLimiter, ApiController.generateScriptAI);

// File System APIs
router.get('/fs/ls', ApiController.listFiles);
router.post('/fs/pick', ApiController.pickFile);
router.get('/fs/drives', ApiController.listDrives);
router.get('/fs/home', ApiController.getHomeDirs);
router.get('/fs/assets', ApiController.listGalleryAssets);
router.delete('/fs/assets/:filename', ApiController.deleteAsset);
router.get('/fs/view', ApiController.viewFile);

export default router;
