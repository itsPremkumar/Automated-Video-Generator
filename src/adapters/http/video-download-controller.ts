import { Request, Response } from 'express';
import { videoDownloadAppService } from '../../application/video-download-app.service';

/**
 * Handle script analysis and media download request.
 */
export const processDownloadRequest = async (req: Request, res: Response) => {
    try {
        const { script, orientation, source } = req.body as { 
            script: string; 
            orientation?: 'portrait' | 'landscape';
            source?: 'all' | 'pexels' | 'pixabay';
        };

        if (!script) {
            return res.status(400).json({ success: false, error: 'Script is required' });
        }

        const data = await videoDownloadAppService.processDownload(script, orientation, source);
        
        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Internal server error' 
        });
    }
};
