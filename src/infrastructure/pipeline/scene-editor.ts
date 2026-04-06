import * as fs from 'fs';
import * as path from 'path';
import { downloadMedia, fetchVisualsForScene, getVideoMetadata } from '../../lib/visual-fetcher';
import { DEFAULT_VOICE_CONFIG, generateVoiceovers, LANGUAGE_DEFAULTS } from '../../lib/voice-generator';
import { createPipelineWorkspace, toPublicRelativePath } from '../../pipeline-workspace';
import { resolveProjectPath } from '../../shared/runtime/paths';

type SceneEditorOptions = {
    voice?: string;
};

export async function updateSceneInJob(
    outputDir: string,
    sceneIndex: number,
    updates: any,
    options: SceneEditorOptions = {},
): Promise<any> {
    const dataPath = path.join(outputDir, 'scene-data.json');
    if (!fs.existsSync(dataPath)) {
        throw new Error(`Scene data not found at: ${dataPath}`);
    }

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const scene = data.scenes[sceneIndex];
    if (!scene) {
        throw new Error(`Scene ${sceneIndex} not found in data.`);
    }

    const oldText = scene.voiceoverText;
    const oldKeywords = JSON.stringify(scene.searchKeywords || []);
    const oldLocalAsset = scene.localAsset;
    const oldVoiceConfig = JSON.stringify(scene.voiceConfig || {});

    if (updates.voiceoverText !== undefined) scene.voiceoverText = updates.voiceoverText;
    if (updates.searchKeywords !== undefined) scene.searchKeywords = updates.searchKeywords;
    if (updates.localAsset !== undefined) scene.localAsset = updates.localAsset;
    if (updates.duration !== undefined) scene.duration = updates.duration;
    if (updates.showText !== undefined) scene.showText = updates.showText;
    if (updates.voiceConfig !== undefined) scene.voiceConfig = updates.voiceConfig;

    const workspace = createPipelineWorkspace(outputDir, data.assetNamespace);
    const textChanged = updates.voiceoverText !== undefined && updates.voiceoverText !== oldText;
    const voiceChanged = updates.voiceConfig !== undefined && JSON.stringify(updates.voiceConfig) !== oldVoiceConfig;

    if (textChanged || voiceChanged) {
        const audioDir = workspace.audioDir;
        let voice = options.voice || data.voice;
        if (!voice && data.language) {
            voice = LANGUAGE_DEFAULTS[data.language.toLowerCase()];
        }
        if (!voice) voice = DEFAULT_VOICE_CONFIG.voice;

        const baseVoiceConfig = { ...DEFAULT_VOICE_CONFIG, voice, language: data.language };

        if (scene.audioPath) {
            const fullPath = path.resolve(outputDir, scene.audioPath);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }

        const audioFiles = await generateVoiceovers([scene], audioDir, baseVoiceConfig);
        const result = audioFiles.get(scene.sceneNumber);

        if (result) {
            scene.audioPath = toPublicRelativePath(result.path);
            scene.duration = result.duration;
        }
    }

    const newKeywords = JSON.stringify(scene.searchKeywords || []);
    const keywordsChanged = updates.searchKeywords !== undefined && newKeywords !== oldKeywords;
    const assetChanged = updates.localAsset !== undefined && updates.localAsset !== oldLocalAsset;

    if (keywordsChanged || assetChanged) {
        const videoDir = workspace.videosDir;
        const visualsDir = workspace.visualsDir;

        let visual: any = null;
        if (scene.localAsset) {
            const assetsDir = resolveProjectPath('input', 'input-assests');
            const sourcePath = path.join(assetsDir, scene.localAsset);
            const targetPath = path.join(visualsDir, scene.localAsset);
            if (fs.existsSync(sourcePath)) {
                if (!fs.existsSync(targetPath)) fs.copyFileSync(sourcePath, targetPath);
                const ext = path.extname(scene.localAsset).toLowerCase();
                const isVideo = ['.mp4', '.mov', '.webm', '.m4v'].includes(ext);
                visual = {
                    type: isVideo ? 'video' : 'image',
                    url: `local://${scene.localAsset}`,
                    width: data.orientation === 'landscape' ? 1920 : 1080,
                    height: data.orientation === 'landscape' ? 1080 : 1920,
                    localPath: toPublicRelativePath(targetPath),
                };
                if (isVideo) {
                    const meta = getVideoMetadata(targetPath);
                    visual.videoDuration = meta.durationSeconds;
                    visual.videoTrimAfterFrames = meta.trimAfterFrames;
                }
            }
        }

        if (!visual) {
            visual = await fetchVisualsForScene(scene.searchKeywords, true, data.orientation, scene.voiceoverText);
            if (visual && visual.type === 'video') {
                const filename = `scene_${scene.sceneNumber}_v${Date.now()}.mp4`;
                const downloadResult = await downloadMedia(visual.url, videoDir, filename);
                visual.localPath = toPublicRelativePath(downloadResult.path);
                visual.videoDuration = downloadResult.videoDuration;
                visual.videoTrimAfterFrames = downloadResult.videoTrimAfterFrames;
            }
        }

        if (visual) {
            scene.visual = visual;
        }
    }

    data.totalDuration = data.scenes.reduce((acc: number, s: any) => acc + (s.duration || 0), 0);
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    return scene;
}

export async function reorderJobScenes(outputDir: string, fromIndex: number, toIndex: number): Promise<any[]> {
    const dataPath = path.join(outputDir, 'scene-data.json');
    if (!fs.existsSync(dataPath)) throw new Error('Scene data not found');

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    if (!data.scenes[fromIndex] || toIndex < 0 || toIndex >= data.scenes.length) {
        throw new Error('Invalid reorder indices');
    }

    const [movedScene] = data.scenes.splice(fromIndex, 1);
    data.scenes.splice(toIndex, 0, movedScene);
    data.scenes.forEach((s: any, i: number) => { s.sceneNumber = i + 1; });
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    return data.scenes;
}

export async function deleteJobScene(outputDir: string, index: number): Promise<any[]> {
    const dataPath = path.join(outputDir, 'scene-data.json');
    if (!fs.existsSync(dataPath)) throw new Error('Scene data not found');

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    if (!data.scenes[index]) throw new Error('Scene not found');

    data.scenes.splice(index, 1);
    data.scenes.forEach((s: any, i: number) => { s.sceneNumber = i + 1; });
    data.totalDuration = data.scenes.reduce((acc: number, s: any) => acc + (s.duration || 0), 0);
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    return data.scenes;
}
