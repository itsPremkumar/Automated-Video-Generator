import { Request, Response } from 'express';
import { aiAppService } from '../../application/ai-app.service';

export const getVoices = (_req: Request, res: Response) => {
    res.json({ success: true, data: aiAppService.listVoices() });
};

export const generateScriptAI = async (req: Request, res: Response) => {
    res.json({ success: true, data: await aiAppService.generateScript((req.body as { prompt: string }).prompt) });
};
