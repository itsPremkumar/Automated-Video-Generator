import { Request, Response } from 'express';
import { socialDownloadAppService } from '../../application/social-download-app.service';

/**
 * Handle social media video download request.
 */
export const processSocialDownloadRequest = async (req: Request, res: Response) => {
    try {
        const { url } = req.body as { url: string };

        if (!url) {
            return res.status(400).json({ success: false, error: 'URL is required' });
        }

        // For now we don't stream progress back via SSE, just await the final result
        const data = await socialDownloadAppService.processSocialDownload(url);
        
        res.json({ success: true, data });
    } catch (error: any) {
        console.error(`[SOCIAL-CONTROLLER] Error processing social download:`, error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Internal server error' 
        });
    }
};
