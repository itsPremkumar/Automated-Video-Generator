import { Request, Response } from 'express';
import { mediaAppService } from '../../application/media-app.service';

export const getVideos = (req: Request, res: Response) => {
    res.json({ success: true, data: mediaAppService.listPublishedVideos(req) });
};

export const getVideoById = (req: Request, res: Response) => {
    res.json({ success: true, data: mediaAppService.getPublishedVideo(String(req.params.videoId), req) });
};
