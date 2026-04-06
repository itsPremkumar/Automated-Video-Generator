import { Router, Request, Response } from 'express';
import { asyncHandler, validateRequest } from '../../lib/validation';
import { videoIdParamsSchema } from '../../schemas/api.schemas';
import { mediaAppService } from '../../application/media-app.service';

const router = Router();

router.get('/files/:videoId/video', validateRequest({ params: videoIdParamsSchema }), asyncHandler((req: Request, res: Response) => {
    const video = mediaAppService.getPublishedVideoFile(String(req.params.videoId), req);
    res.type('video/mp4').sendFile(video.videoPath);
}));

router.get('/files/:videoId/thumbnail', validateRequest({ params: videoIdParamsSchema }), asyncHandler((req: Request, res: Response) => {
    const video = mediaAppService.getPublishedVideoFile(String(req.params.videoId), req);
    if (!video.thumbnailPath) {
        res.status(404).send('Thumbnail not found.');
        return;
    }
    res.sendFile(video.thumbnailPath);
}));

router.get('/download/:videoId', validateRequest({ params: videoIdParamsSchema }), asyncHandler((req: Request, res: Response) => {
    const video = mediaAppService.getPublishedVideoFile(String(req.params.videoId), req);
    res.download(video.videoPath, video.videoFilename);
}));

export default router;
