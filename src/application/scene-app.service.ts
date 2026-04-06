import * as fs from 'fs';
import * as path from 'path';
import { jobStore } from '../infrastructure/persistence/job-store';
import { deleteJobScene, reorderJobScenes, updateSceneInJob } from '../infrastructure/pipeline/scene-editor';
import { NotFoundError } from '../lib/errors';
import { refineSceneAI } from '../services/ai.service';
import { resolveProjectPath } from '../shared/runtime/paths';

type SceneDataFile = { scenes: any[] };

function getJobOutputDir(jobId: string): string {
    const job = jobStore.get(jobId);
    if (!job) {
        throw new NotFoundError('Job not found.');
    }

    const publicId = job.publicId || (job.outputPath ? path.basename(path.dirname(job.outputPath)) : null);
    if (!publicId) {
        throw new NotFoundError('Job output directory not found.');
    }

    return resolveProjectPath('output', publicId);
}

function readSceneData(outputDir: string): SceneDataFile {
    const dataPath = path.join(outputDir, 'scene-data.json');
    if (!fs.existsSync(dataPath)) {
        throw new NotFoundError('Scene data not found.');
    }

    return JSON.parse(fs.readFileSync(dataPath, 'utf8')) as SceneDataFile;
}

function getSceneOrThrow(scenes: any[], sceneIndex: number) {
    const scene = scenes[sceneIndex];
    if (!scene) {
        throw new NotFoundError('Scene not found.');
    }

    return scene;
}

export class SceneAppService {
    getJobScenes(jobId: string) {
        const outputDir = getJobOutputDir(jobId);
        return readSceneData(outputDir).scenes;
    }

    updateScene(jobId: string, sceneIndex: number, updates: unknown) {
        const outputDir = getJobOutputDir(jobId);
        return updateSceneInJob(outputDir, sceneIndex, updates);
    }

    reorderScenes(jobId: string, fromIndex: number, toIndex: number) {
        const outputDir = getJobOutputDir(jobId);
        return reorderJobScenes(outputDir, fromIndex, toIndex);
    }

    deleteScene(jobId: string, sceneIndex: number) {
        const outputDir = getJobOutputDir(jobId);
        return deleteJobScene(outputDir, sceneIndex);
    }

    async refineScene(jobId: string, sceneIndex: number, instruction: string) {
        const outputDir = getJobOutputDir(jobId);
        const data = readSceneData(outputDir);
        const scene = getSceneOrThrow(data.scenes, sceneIndex);
        const refined = await refineSceneAI(scene.voiceoverText, scene.searchKeywords, instruction);
        return updateSceneInJob(outputDir, sceneIndex, refined);
    }
}

export const sceneAppService = new SceneAppService();
