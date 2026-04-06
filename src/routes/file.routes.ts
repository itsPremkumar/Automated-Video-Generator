import { Router, Request, Response } from 'express';
import { asyncHandler, validateRequest } from '../lib/validation';
import { videoIdParamsSchema } from '../schemas/api.schemas';
import { getVideo } from '../services/video.service';

const router = Router();

router.get('/files/:videoId/video', validateRequest({ params: videoIdParamsSchema }), asyncHandler((req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video) {
        res.status(404).send('Video not found.');
        return;
    }
    res.type('video/mp4').sendFile(video.videoPath);
}));

router.get('/files/:videoId/thumbnail', validateRequest({ params: videoIdParamsSchema }), asyncHandler((req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video || !video.thumbnailPath) {
        res.status(404).send('Thumbnail not found.');
        return;
    }
    res.sendFile(video.thumbnailPath);
}));

router.get('/download/:videoId', validateRequest({ params: videoIdParamsSchema }), asyncHandler((req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video) {
        res.status(404).send('Video not found.');
        return;
    }
    res.download(video.videoPath, video.videoFilename);
}));

export default router;
