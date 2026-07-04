import { parseScript, validateScript } from './lib/script-parser';
import { fetchVisualsForScene, downloadMedia, getVideoMetadata, invalidateCachedVisual } from './lib/visual-fetcher';
import { generateVoiceovers, DEFAULT_VOICE_CONFIG, LANGUAGE_DEFAULTS } from './lib/voice-generator';
import { getAudioDuration, splitAudioFile, generateSilence, applyAutoDucking } from './lib/audio-processor';
import { verifyMedia, verificationPasses, MEDIA_VERIFICATION_ENABLED } from './lib/media-verifier';
import * as fs from 'fs';
import * as path from 'path';
import { logError, logInfo } from './shared/logging/runtime-logging';
import { resolveProjectPath } from './shared/runtime/paths';
import { INPUT_ASSET_ROOT, inputAssetPath } from './lib/path-safety';

import { createPipelineWorkspace, ensurePipelineWorkspace, toPublicRelativePath } from './pipeline-workspace';
import { JobCancellationError } from './lib/job-cancellation';

const console = {
    log: (...args: unknown[]) => logInfo(...args),
    warn: (...args: unknown[]) => logInfo('[WARNING]', ...args),
    error: (...args: unknown[]) => logError(...args),
};

interface GenerationResult {
    success: boolean;
    outputPath?: string;
    error?: string;
    metadata?: {
        scenes: number;
        duration: number;
        visualsFound: number;
    };
}

interface GenerationOptions {
    onProgress?: (step: string, percent: number, message: string) => void;
    shouldCancel?: () => boolean;
    orientation?: 'portrait' | 'landscape';
    voice?: string;
    title?: string;
    showText?: boolean;
    defaultVideo?: string;
    publicId?: string;
    backgroundMusic?: string;
    personalAudio?: string;
    musicVolume?: number;
    language?: string;
    textConfig?: {
        color?: string;
        fontSize?: number;
        position?: 'top' | 'center' | 'bottom';
        animation?: 'fade' | 'slide' | 'zoom' | 'typewriter' | 'pop';
        background?: 'none' | 'box' | 'glass';
        glow?: boolean;
    };
}

function throwIfCancelled(shouldCancel?: () => boolean): void {
    if (shouldCancel?.()) {
        throw new JobCancellationError();
    }
}

export async function generateVideo(
    script: string,
    outputDir: string = resolveProjectPath('output'),
    options: GenerationOptions = {}
): Promise<GenerationResult> {
    const { onProgress, orientation = 'portrait', title, showText = true, defaultVideo = 'default.mp4', publicId, backgroundMusic, personalAudio, musicVolume, language, textConfig, shouldCancel } = options;

    let voice = options.voice;
    if (!voice && language) {
        voice = LANGUAGE_DEFAULTS[language.toLowerCase()];
    }
    if (!voice) {
        voice = DEFAULT_VOICE_CONFIG.voice;
    }

    const totalStartTime = Date.now();
    const workspace = createPipelineWorkspace(outputDir, publicId);

    const reportProgress = (step: string, percent: number, message: string) => {
        throwIfCancelled(shouldCancel);
        onProgress?.(step, percent, message);
        throwIfCancelled(shouldCancel);
    };

    try {
        reportProgress('init', 0, 'Starting video generation');

        const PIPELINE_TIMEOUT_MS = 30 * 60 * 1000;
        const pipelineDeadline = Date.now() + PIPELINE_TIMEOUT_MS;

        // STEP 1: Validate Script
        const step1Start = Date.now();
        reportProgress('validate', 5, 'Validating script');
        validateScript(script, !!personalAudio);
        throwIfCancelled(shouldCancel);
        const step1Time = Date.now() - step1Start;

        // STEP 2: Parse Script
        const step2Start = Date.now();
        reportProgress('parse', 10, 'Parsing script into scenes');
        const parsed = await parseScript(script);
        throwIfCancelled(shouldCancel);

        const hasManualVisuals = parsed.scenes.some(s => s.localAsset);
        const isMinimalScript = parsed.scenes.length === 0 ||
            (!hasManualVisuals && parsed.scenes.every(s => s.voiceoverText.length < 50));

        if (isMinimalScript && personalAudio) {
            const personalAudioPath = resolveProjectPath('input', 'music', personalAudio);
            let totalDuration = 30;

            if (fs.existsSync(personalAudioPath)) {
                try {
                    totalDuration = await getAudioDuration(personalAudioPath);
                } catch {
                    console.warn('Failed to get audio duration, using 30s default');
                }
            }

            const mediaExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.webm', '.gif'];
            let foundAssets: string[] = [];

            if (fs.existsSync(INPUT_ASSET_ROOT)) {
                foundAssets = fs.readdirSync(INPUT_ASSET_ROOT)
                    .filter(file => mediaExtensions.includes(path.extname(file).toLowerCase()))
                    .sort();
            }

            if (foundAssets.length > 0) {
                parsed.scenes = [];
                const durationPerScene = totalDuration / foundAssets.length;

                foundAssets.forEach((asset, index) => {
                    parsed.scenes.push({
                        sceneNumber: index + 1,
                        duration: durationPerScene,
                        visualDescription: `Slideshow: ${asset}`,
                        voiceoverText: '',
                        searchKeywords: [asset],
                        localAsset: asset
                    });
                });
            } else if (parsed.scenes.length === 0) {
                parsed.scenes.push({
                    sceneNumber: 1,
                    duration: totalDuration,
                    visualDescription: title || 'Main Scene',
                    voiceoverText: '',
                    searchKeywords: [title || 'video'],
                });
            }

            parsed.totalDuration = totalDuration;
        }

        if (parsed.scenes.length === 0) {
            throw new Error('No scenes could be parsed from the script. Please ensure you have narration text or visual tags.');
        }

        const step2Time = Date.now() - step2Start;

        // STEP 3: Fetch Visuals
        const step3Start = Date.now();
        const videoDir = workspace.videosDir;
        const visualsDir = workspace.visualsDir;
        const visuals: (import('./lib/visual-fetcher').MediaAsset | null)[] = [];

        ensurePipelineWorkspace(workspace);

        const CONCURRENCY = 5;
        let activePromises: Promise<void>[] = [];

        const processScene = async (i: number) => {
            const scene = parsed.scenes[i];
            const progressPercent = 15 + Math.floor((i / parsed.scenes.length) * 35);
            reportProgress('visuals', progressPercent, `Downloading video ${i + 1}/${parsed.scenes.length}`);
            throwIfCancelled(shouldCancel);

            try {
                let visual: any = null;

                if (scene.localAsset) {
                    const assetsDir = inputAssetPath();
                    const sourcePath = path.join(assetsDir, scene.localAsset);
                    const ext = path.extname(scene.localAsset).toLowerCase();
                    const isVideo = ['.mp4', '.mov', '.webm', '.m4v'].includes(ext);
                    const targetPath = path.join(visualsDir, scene.localAsset);

                    if (fs.existsSync(sourcePath)) {
                        if (!fs.existsSync(targetPath)) {
                            fs.copyFileSync(sourcePath, targetPath);
                        }

                        visual = {
                            type: isVideo ? 'video' : 'image',
                            url: `local://${scene.localAsset}`,
                            width: orientation === 'landscape' ? 1920 : 1080,
                            height: orientation === 'landscape' ? 1080 : 1920,
                            localPath: toPublicRelativePath(targetPath),
                        };

                        if (isVideo) {
                            const videoMetadata = getVideoMetadata(targetPath);
                            visual.videoDuration = videoMetadata.durationSeconds;
                            visual.videoTrimAfterFrames = videoMetadata.trimAfterFrames;
                        }
                    }
                }

                if (!visual) {
                    visual = await fetchVisualsForScene(scene.searchKeywords, true, orientation, scene.voiceoverText);

                    if (visual && visual.type === 'video') {
                        try {
                            const filename = `scene_${i + 1}.mp4`;
                            const downloadResult = await downloadMedia(visual.url, videoDir, filename);
                            if (downloadResult.videoTrimAfterFrames && downloadResult.videoTrimAfterFrames < 5) {
                                throw new Error(`Downloaded video clip is too short to render reliably: ${filename}`);
                            }
                            visual.localPath = toPublicRelativePath(downloadResult.path);
                            visual.videoDuration = downloadResult.videoDuration;
                            visual.videoTrimAfterFrames = downloadResult.videoTrimAfterFrames;

                            if (MEDIA_VERIFICATION_ENABLED) {
                                const verification = await verifyMedia(downloadResult.path, scene.searchKeywords);
                                if (!verificationPasses(verification)) {
                                    invalidateCachedVisual(scene.searchKeywords, orientation);
                                    try { fs.unlinkSync(downloadResult.path); } catch { }
                                    throw new Error(`Visual verification failed for ${filename}`);
                                }
                            }
                        } catch (err: any) {
                            invalidateCachedVisual(scene.searchKeywords, orientation);
                            visual = null;
                        }
                    }
                }

                if (!visual) {
                    const fallbackPathInput = inputAssetPath(defaultVideo);
                    const fallbackPathVisuals = path.join(visualsDir, defaultVideo);

                    if (fs.existsSync(fallbackPathInput)) {
                        if (!fs.existsSync(fallbackPathVisuals)) {
                            fs.copyFileSync(fallbackPathInput, fallbackPathVisuals);
                        }
                        visual = {
                            type: 'video',
                            url: `local://${defaultVideo}`,
                            width: orientation === 'landscape' ? 1920 : 1080,
                            height: orientation === 'landscape' ? 1080 : 1920,
                            localPath: toPublicRelativePath(fallbackPathVisuals),
                        };
                        const videoMetadata = getVideoMetadata(fallbackPathVisuals);
                        visual.videoDuration = videoMetadata.durationSeconds;
                        visual.videoTrimAfterFrames = videoMetadata.trimAfterFrames;
                    }
                }

                if (!visual) {
                    const imageFallback = await fetchVisualsForScene(scene.searchKeywords, false, orientation, scene.voiceoverText);
                    visual = imageFallback && imageFallback.type === 'image' ? imageFallback : null;
                }

                if (visual?.type === 'video' && !visual.localPath) {
                    visual = null;
                }

                visuals[i] = visual;
                throwIfCancelled(shouldCancel);
            } catch (err: any) {
                visuals[i] = null;
                throwIfCancelled(shouldCancel);
            }
        };

        for (let i = 0; i < parsed.scenes.length; i++) {
            const p = processScene(i)
                .catch((err: any) => {
                    visuals[i] = null;
                })
                .then(() => {
                    activePromises.splice(activePromises.indexOf(p), 1);
                });
            activePromises.push(p);
            if (activePromises.length >= CONCURRENCY) {
                await Promise.race(activePromises);
            }
        }
        await Promise.all(activePromises);

        const visualsFound = visuals.filter(v => v !== null).length;
        const step3Time = Date.now() - step3Start;

        // STEP 4: Generate Voiceovers
        const step4Start = Date.now();
        reportProgress('audio', 55, 'Generating voiceovers');
        const audioDir = workspace.audioDir;

        let audioFiles: Map<number, { path: string; duration: number }>;

        if (personalAudio) {
            reportProgress('audio', 55, 'Processing personal audio recording');
            const personalAudioPath = resolveProjectPath('input', 'music', personalAudio);

            if (fs.existsSync(personalAudioPath)) {
                const totalDuration = await getAudioDuration(personalAudioPath);
                const durationPerScene = totalDuration / parsed.scenes.length;
                const durations = parsed.scenes.map(() => durationPerScene);
                audioFiles = await splitAudioFile(personalAudioPath, durations, audioDir);
            } else {
                throw new Error(`Personal audio file not found: ${personalAudio}`);
            }
        } else {
            const voiceConfig = {
                ...DEFAULT_VOICE_CONFIG,
                voice: voice || DEFAULT_VOICE_CONFIG.voice,
                language,
            };
            audioFiles = await generateVoiceovers(parsed.scenes, audioDir, voiceConfig);
        }

        // Background Music & Auto-Ducking
        let resolvedMusicPath: string | undefined = undefined;
        if (backgroundMusic) {
            const musicInputPath = resolveProjectPath('input', 'music', backgroundMusic);
            if (fs.existsSync(musicInputPath)) {
                reportProgress('audio', 80, 'Applying auto-ducking to background music');

                const duckingVoicePaths: string[] = [];
                for (let i = 0; i < parsed.scenes.length; i++) {
                    const scene = parsed.scenes[i];
                    const audioResult = audioFiles.get(scene.sceneNumber);
                    const actualDuration = audioResult?.duration || scene.duration;
                    if (audioResult && audioResult.path) {
                        duckingVoicePaths.push(audioResult.path);
                    } else {
                        const silencePath = await generateSilence(actualDuration, audioDir, scene.sceneNumber);
                        duckingVoicePaths.push(silencePath);
                    }
                }

                try {
                    const duckedBgmPath = await applyAutoDucking(musicInputPath, duckingVoicePaths, audioDir);
                    resolvedMusicPath = toPublicRelativePath(duckedBgmPath);
                } catch (duckError: any) {
                    const targetPath = path.join(audioDir, backgroundMusic);
                    fs.copyFileSync(musicInputPath, targetPath);
                    resolvedMusicPath = toPublicRelativePath(targetPath);
                }
            }
        }

        const step4Time = Date.now() - step4Start;

        // STEP 5: Save Scene Data
        const step5Start = Date.now();
        reportProgress('prepare', 90, 'Preparing scene data');

        let totalActualDuration = 0;
        const scenesWithAudio = parsed.scenes.map((scene, index) => {
            const audioResult = audioFiles.get(scene.sceneNumber);
            const actualDuration = audioResult?.duration || scene.duration;
            totalActualDuration += actualDuration;
            return {
                ...scene,
                duration: actualDuration,
                visual: visuals[index],
                audioPath: audioResult?.path ? toPublicRelativePath(audioResult.path) : undefined,
            };
        });

        const sceneData = {
            scenes: scenesWithAudio,
            totalDuration: totalActualDuration,
            style: parsed.videoStyle,
            orientation,
            title,
            showText,
            textConfig,
            backgroundMusic: resolvedMusicPath,
            musicVolume: typeof musicVolume === 'number' ? musicVolume : undefined,
            assetNamespace: workspace.publicNamespace,
        };

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const dataPath = path.join(outputDir, 'scene-data.json');
        const jsonData = JSON.stringify(sceneData, null, 2);
        fs.writeFileSync(dataPath, jsonData);

        const step5Time = Date.now() - step5Start;

        // STEP 6: Generate Metadata
        const step6Start = Date.now();
        reportProgress('metadata', 95, 'Generating metadata');

        const sentences = parsed.scenes.map(s => s.voiceoverText).join(' ').split('. ');
        const description = sentences.slice(0, 3).join('. ') + (sentences.length > 3 ? '.' : '');

        const uniqueKeywords = new Set<string>();
        parsed.scenes.forEach(scene => {
            scene.searchKeywords.forEach(k => uniqueKeywords.add(k.replace(/\s+/g, '').toLowerCase()));
        });
        uniqueKeywords.add('ai');
        uniqueKeywords.add('future');
        uniqueKeywords.add('technology');

        const hashtags = Array.from(uniqueKeywords).map(k => `#${k}`).join(' ');
        const metadataContent = `${title || 'Video'}\n\n${description}\n\n${hashtags}`;
        const safeTitle = (title || 'video').replace(/[<>:"/\\|?*]/g, '').trim();
        const metadataPath = path.join(outputDir, `${safeTitle} details.txt`);
        fs.writeFileSync(metadataPath, metadataContent);

        const step6Time = Date.now() - step6Start;

        // Complete
        reportProgress('complete', 100, 'Pre-processing complete');

        return {
            success: true,
            outputPath: dataPath,
            metadata: {
                scenes: parsed.scenes.length,
                duration: parsed.totalDuration,
                visualsFound,
            },
        };

    } catch (error: any) {
        const totalTime = Date.now() - totalStartTime;
        console.error(`Video generation failed after ${totalTime}ms: ${error.message}`);
        onProgress?.('error', 0, error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

export { deleteJobScene, reorderJobScenes, updateSceneInJob } from './infrastructure/pipeline/scene-editor';
