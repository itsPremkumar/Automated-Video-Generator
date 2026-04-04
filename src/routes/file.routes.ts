import { Router, Request, Response } from 'express';
import { getVideo } from '../services/video.service';

const router = Router();

router.get('/files/:videoId/video', (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video) {
        res.status(404).send('Video not found.');
        return;
    }
    res.type('video/mp4').sendFile(video.videoPath);
});

router.get('/files/:videoId/thumbnail', (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video || !video.thumbnailPath) {
        res.status(404).send('Thumbnail not found.');
        return;
    }
    res.sendFile(video.thumbnailPath);
});

router.get('/download/:videoId', (req: Request, res: Response) => {
    const videoId = String(req.params.videoId);
    const video = getVideo(videoId, req);
    if (!video) {
        res.status(404).send('Video not found.');
        return;
    }
    res.download(video.videoPath, video.videoFilename);
});

export default router;
