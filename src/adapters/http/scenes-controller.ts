import { Request, Response } from 'express';
import { sceneAppService } from '../../application/scene-app.service';
import { toSceneIndex } from './api-helpers';

export const getJobScenes = (req: Request, res: Response) => {
    res.json({ success: true, data: sceneAppService.getJobScenes(String(req.params.jobId)) });
};

export const updateJobScene = async (req: Request, res: Response) => {
    const updatedScene = await sceneAppService.updateScene(String(req.params.jobId), toSceneIndex(String(req.params.sceneIndex)), req.body);
    res.json({ success: true, data: updatedScene });
};

export const reorderScenes = async (req: Request, res: Response) => {
    const { fromIndex, toIndex } = req.body as { fromIndex: number; toIndex: number };
    const scenes = await sceneAppService.reorderScenes(String(req.params.jobId), fromIndex, toIndex);
    res.json({ success: true, data: scenes });
};

export const deleteScene = async (req: Request, res: Response) => {
    const scenes = await sceneAppService.deleteScene(String(req.params.jobId), toSceneIndex(String(req.params.sceneIndex)));
    res.json({ success: true, data: scenes });
};

export const refineSceneWithAI = async (req: Request, res: Response) => {
    const { instruction } = req.body as { instruction: string };
    const updatedScene = await sceneAppService.refineScene(String(req.params.jobId), toSceneIndex(String(req.params.sceneIndex)), instruction);
    res.json({ success: true, data: updatedScene });
};
