import * as fs from 'fs';
import { Request, Response } from 'express';
import { filesystemAppService } from '../../application/filesystem-app.service';

export const listFiles = (req: Request, res: Response) => {
    res.json({ success: true, data: filesystemAppService.listFiles(req.query.path ? String(req.query.path) : undefined) });
};

export const pickFile = (req: Request, res: Response) => {
    const { sourcePath, type } = req.body as { sourcePath: string; type: 'asset' | 'media' | 'music' | 'personalAudio' };
    res.json({ success: true, data: filesystemAppService.pickFile(sourcePath, type) });
};

export const listGalleryAssets = (_req: Request, res: Response) => {
    res.json({ success: true, data: filesystemAppService.listGalleryAssets() });
};

export const deleteAsset = (req: Request, res: Response) => {
    filesystemAppService.deleteAsset(String(req.params.filename));
    res.json({ success: true, message: 'Asset deleted successfully.' });
};

export const viewFile = (req: Request, res: Response) => {
    const result = filesystemAppService.getViewFile(String(req.query.path), req.headers.range);
    if (result.type === 'range') {
        const stream = fs.createReadStream(result.filePath, { start: result.start, end: result.end });
        res.writeHead(206, {
            'Content-Range': `bytes ${result.start}-${result.end}/${result.stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': result.end - result.start + 1,
            'Content-Type': result.contentType,
        });
        stream.pipe(res);
        return;
    }

    if (result.contentType) {
        res.setHeader('Content-Type', result.contentType);
    }

    res.sendFile(result.filePath);
};

export const listDrives = async (_req: Request, res: Response) => {
    res.json({ success: true, data: await filesystemAppService.listDrives() });
};

export const getHomeDirs = (_req: Request, res: Response) => {
    res.json({ success: true, data: filesystemAppService.getHomeDirs() });
};
