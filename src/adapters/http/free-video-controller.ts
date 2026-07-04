import { Request, Response } from 'express';
import { freeVideoAppService } from '../../application/free-video-app.service';

export const search = async (req: Request, res: Response) => {
    try {
        const keyword = String(req.query.keyword || '').trim();
        if (!keyword) {
            return res.status(400).json({ success: false, error: 'Keyword is required' });
        }

        const source = req.query.source as string | undefined;
        const count = req.query.count ? parseInt(String(req.query.count), 10) : undefined;
        const maxDuration = req.query.maxDuration ? parseInt(String(req.query.maxDuration), 10) : undefined;
        const minResolution = req.query.minResolution ? parseInt(String(req.query.minResolution), 10) : undefined;
        const sortBy = req.query.sortBy as 'relevance' | 'newest' | 'resolution' | undefined;

        const validSources = ['wikimedia', 'archive', 'all'] as const;
        const resolvedSource = source && validSources.includes(source as any) ? source as 'wikimedia' | 'archive' | 'all' : 'all';

        const data = await freeVideoAppService.search(keyword, {
            source: resolvedSource,
            count: count ? Math.min(Math.max(count, 1), 50) : 5,
            maxDuration: maxDuration ? Math.max(maxDuration, 1) : undefined,
            minResolution: minResolution ? Math.max(minResolution, 360) : undefined,
            sortBy: sortBy || undefined,
        });

        res.json({ success: true, data });
    } catch (error: any) {
        console.error('[FREE-VIDEO-CONTROLLER] Search error:', error);
        res.status(500).json({ success: false, error: error.message || 'Search failed' });
    }
};

export const download = async (req: Request, res: Response) => {
    try {
        const { url, title, creator, license, format } = req.body as {
            url: string;
            title: string;
            creator?: string;
            license?: string;
            format?: string;
        };

        if (!url || !title) {
            return res.status(400).json({ success: false, error: 'URL and title are required' });
        }

        const data = await freeVideoAppService.download(
            url,
            title,
            creator || 'Unknown',
            license || 'Unknown',
            format || 'mp4',
        );

        res.json({ success: true, data });
    } catch (error: any) {
        console.error('[FREE-VIDEO-CONTROLLER] Download error:', error);
        res.status(500).json({ success: false, error: error.message || 'Download failed' });
    }
};

export const sources = (_req: Request, res: Response) => {
    res.json({
        success: true,
        data: [
            {
                id: 'wikimedia',
                name: 'Wikimedia Commons',
                description: 'Free media repository with CC-licensed videos',
                apiKeyRequired: false,
                url: 'https://commons.wikimedia.org',
            },
            {
                id: 'archive',
                name: 'Internet Archive',
                description: 'Digital library with public domain videos',
                apiKeyRequired: false,
                url: 'https://archive.org',
            },
        ],
    });
};
