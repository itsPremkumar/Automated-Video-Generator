import { parseScript, validateScript } from './lib/script-parser';
import { fetchVisualsForScene, downloadMedia, getVideoMetadata, invalidateCachedVisual } from './lib/visual-fetcher';
import { generateVoiceovers, DEFAULT_VOICE_CONFIG, LANGUAGE_DEFAULTS } from './lib/voice-generator';
import { getAudioDuration, splitAudioFile, generateSilence, applyAutoDucking } from './lib/audio-processor';
import * as fs from 'fs';
import * as path from 'path';
import { logError, logInfo } from './shared/logging/runtime-logging';
import { resolveProjectPath } from './shared/runtime/paths';
import { createPipelineWorkspace, ensurePipelineWorkspace, toPublicRelativePath } from './pipeline-workspace';
import { JobCancellationError } from './lib/job-cancellation';

const console = {
    log: (...args: unknown[]) => logInfo(...args),
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
    /** Callback for progress updates */
    onProgress?: (step: string, percent: number, message: string) => void;
    /** Allow long-running work to stop at safe checkpoints */
    shouldCancel?: () => boolean;
    /** Output video orientation */
    orientation?: 'portrait' | 'landscape';
    /** Voice for TTS */
    voice?: string;
    /** Video Title */
    title?: string;
    /** Show Text */
    showText?: boolean;
    /** Default Video Fallback */
    defaultVideo?: string;
    /** Stable public/output identifier */
    publicId?: string;
    /** Background Music */
    backgroundMusic?: string;
    /** Personal Audio */
    personalAudio?: string;
    musicVolume?: number;
    /** Language key for default voice mapping */
    language?: string;
    /** Text configuration */
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


// console.log('\n🎬 [VIDEO-GEN] Module loaded');
// console.log(`🎬 [VIDEO-GEN] Working directory: ${process.cwd()}`);

/**
 * Main video generation orchestrator
 */
export async function generateVideo(
    script: string,
    outputDir: string = resolveProjectPath('output'),
    options: GenerationOptions = {}
): Promise<GenerationResult> {
    const { onProgress, orientation = 'portrait', title, showText = true, defaultVideo = 'default.mp4', publicId, backgroundMusic, personalAudio, musicVolume, language, textConfig, shouldCancel } = options;
    
    // Resolve voice: 1. explicit voice, 2. default for language, 3. global default
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


    // console.log('\n');
    // console.log('╔════════════════════════════════════════════════════════════════╗');
    // console.log('║              🎬 VIDEO GENERATION PIPELINE STARTED              ║');
    // console.log('╚════════════════════════════════════════════════════════════════╝');
    // console.log(`\n🎬 [VIDEO-GEN] Start time: ${new Date().toISOString()}`);
    // console.log(`🎬 [VIDEO-GEN] Output directory: ${outputDir}`);
    // console.log(`🎬 [VIDEO-GEN] Script length: ${script.length} characters`);
    // console.log(`🎬 [VIDEO-GEN] Orientation: ${orientation}\n`);

    try {
        reportProgress('init', 0, 'Starting video generation');

        // ══════════════════════════════════════════════════════════════════
        // STEP 1: VALIDATE SCRIPT
        // ══════════════════════════════════════════════════════════════════
        // console.log('\n╔══════════════════════════════════════════╗');
        // console.log('║         STEP 1: VALIDATING SCRIPT         ║');
        // console.log('╚══════════════════════════════════════════╝');

        const step1Start = Date.now();
        reportProgress('validate', 5, 'Validating script');

        validateScript(script);
        throwIfCancelled(shouldCancel);

        const step1Time = Date.now() - step1Start;
        // console.log(`✅ [STEP 1] Script validated in ${step1Time}ms\n`);

        // ══════════════════════════════════════════════════════════════════
        // STEP 2: PARSE SCRIPT
        // ══════════════════════════════════════════════════════════════════
        // console.log('\n╔══════════════════════════════════════════╗');
        // console.log('║          STEP 2: PARSING SCRIPT           ║');
        // console.log('╚══════════════════════════════════════════╝');

        const step2Start = Date.now();
        reportProgress('parse', 10, 'Parsing script into scenes');

        const parsed = await parseScript(script);
        throwIfCancelled(shouldCancel);

        const step2Time = Date.now() - step2Start;
        // console.log(`✅ [STEP 2] Created ${parsed.scenes.length} scenes in ${step2Time}ms`);
        // console.log(`✅ [STEP 2] Total duration: ${parsed.totalDuration}s`);
        // console.log(`✅ [STEP 2] Video style: ${parsed.videoStyle}\n`);

        // Log all scenes summary
        // console.log('📋 [STEP 2] Scene Summary:');
        parsed.scenes.forEach((scene, idx) => {
            // console.log(`   Scene ${idx + 1}: ${scene.duration}s - "${scene.voiceoverText.substring(0, 40)}..."`);
        });
        // console.log('');

        // ══════════════════════════════════════════════════════════════════
        // STEP 3: FETCH VISUALS
        // ══════════════════════════════════════════════════════════════════
        // console.log('\n╔══════════════════════════════════════════╗');
        // console.log('║       STEP 3: FETCHING STOCK VIDEOS       ║');
        // console.log('╚══════════════════════════════════════════╝');

        const step3Start = Date.now();
        const videoDir = workspace.videosDir;
        const visualsDir = workspace.visualsDir;
        const visuals: (import('./lib/visual-fetcher').MediaAsset | null)[] = [];

        ensurePipelineWorkspace(workspace);

        // console.log(`🎬 [STEP 3] Video output directory: ${videoDir}`);
        // console.log(`🎬 [STEP 3] Visuals directory: ${visualsDir}`);
        // console.log(`🎬 [STEP 3] Processing ${parsed.scenes.length} scenes...\n`);

        // Helper for concurrent processing with limit
        const CONCURRENCY = 5;
        let activePromises: Promise<void>[] = [];

        const processScene = async (i: number) => {
            const scene = parsed.scenes[i];
            const progressPercent = 15 + Math.floor((i / parsed.scenes.length) * 35);
            reportProgress('visuals', progressPercent, `Downloading video ${i + 1}/${parsed.scenes.length}`);
            throwIfCancelled(shouldCancel);

            // console.log(`\n═══ [SCENE ${i + 1}/${parsed.scenes.length}] ═══════════════════════════`);
            // console.log(`🎬 Keywords: [${scene.searchKeywords.join(', ')}]`);

            try {
                let visual: any = null;

                if (scene.localAsset) {
                    const assetsDir = resolveProjectPath('input', 'input-assests');
                    const sourcePath = path.join(assetsDir, scene.localAsset);
                    const ext = path.extname(scene.localAsset).toLowerCase();
                    const isVideo = ['.mp4', '.mov', '.webm', '.m4v'].includes(ext);

                    // Use original filename in public/visuals for reuse
                    const targetFilename = scene.localAsset;
                    const targetPath = path.join(visualsDir, targetFilename);

                    // console.log(`📸 [SCENE ${i + 1}] Using local asset: ${scene.localAsset}`);

                    if (fs.existsSync(sourcePath)) {
                        // Only copy if it doesn't already exist in public/visuals
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
                            // console.log(`⏱️ [SCENE ${i + 1}] Local video duration: ${visual.videoDuration.toFixed(2)}s`);
                        }
                    } else {
                        // console.error(`⚠️ [SCENE ${i + 1}] Local asset NOT FOUND: ${sourcePath}`);
                    }
                }

                if (!visual) {
                    visual = await fetchVisualsForScene(scene.searchKeywords, true, orientation, scene.voiceoverText);

                    if (visual && visual.type === 'video') {
                        try {
                            const filename = `scene_${i + 1}.mp4`;
                            // console.log(`⬇️ [SCENE ${i + 1}] Downloading: ${filename}`);
                            const downloadResult = await downloadMedia(visual.url, videoDir, filename);
                            if (downloadResult.videoTrimAfterFrames && downloadResult.videoTrimAfterFrames < 5) {
                                throw new Error(`Downloaded video clip is too short to render reliably: ${filename}`);
                            }
                            visual.localPath = toPublicRelativePath(downloadResult.path);
                            visual.videoDuration = downloadResult.videoDuration;
                            visual.videoTrimAfterFrames = downloadResult.videoTrimAfterFrames;
                            // console.log(`✅ [SCENE ${i + 1}] Saved: ${filename}`);
                            if (downloadResult.videoDuration) {
                                // console.log(`⏱️ [SCENE ${i + 1}] Video duration: ${downloadResult.videoDuration.toFixed(2)}s`);
                            }
                        } catch (err: any) {
                            // console.error(`⚠️ [SCENE ${i + 1}] Download failed: ${err.message}`);
                            console.log(`⚠️ [SCENE ${i + 1}] Video download failed, trying fallback: ${err.message}`);
                            invalidateCachedVisual(scene.searchKeywords, orientation);

                            visual = null;
                        }
                    } else if (visual) {
                        // console.log(`🖼️ [SCENE ${i + 1}] Using image: ${visual.url}`);
                    } else {
                        // console.log(`⚠️ [SCENE ${i + 1}] No visual found`);
                    }
                }

                // --- DEFAULT VIDEO FALLBACK ---
                if (!visual) {
                    const fallbackPathInput = resolveProjectPath('input', 'input-assests', defaultVideo);
                    const fallbackPathVisuals = path.join(visualsDir, defaultVideo);
                    
                    // console.log(`⚠️ [SCENE ${i + 1}] Attempting default video fallback: ${defaultVideo}`);
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
                        // console.log(`✅ [SCENE ${i + 1}] Fallback successful`);
                    } else {
                        // console.warn(`❌ [SCENE ${i + 1}] Default video ${defaultVideo} not found in input-assests`);
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
                // console.error(`❌ [SCENE ${i + 1}] Error fetching visual: ${err.message}`);
                visuals[i] = null;
                throwIfCancelled(shouldCancel);
            }
        };

        // Execute with concurrency limit
        for (let i = 0; i < parsed.scenes.length; i++) {
            const p = processScene(i).then(() => {
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
        // console.log(`\n✅ [STEP 3] Downloaded ${visualsFound}/${parsed.scenes.length} visuals in ${step3Time}ms\n`);

        // ══════════════════════════════════════════════════════════════════
        // STEP 4: GENERATE VOICEOVERS
        // ══════════════════════════════════════════════════════════════════
        // console.log('\n╔══════════════════════════════════════════╗');
        // console.log('║       STEP 4: GENERATING VOICEOVERS       ║');
        // console.log('╚══════════════════════════════════════════╝');

        const step4Start = Date.now();
        reportProgress('audio', 55, 'Generating voiceovers');
        const audioDir = workspace.audioDir;

        // console.log(`🎤 [STEP 4] Audio output directory: ${audioDir}`);

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

        // ══════════════════════════════════════════════════════════════════
        // STEP 4.5: HANDLE BACKGROUND MUSIC & AUTO-DUCKING
        // ══════════════════════════════════════════════════════════════════
        let resolvedMusicPath: string | undefined = undefined;
        if (backgroundMusic) {
            const musicInputPath = resolveProjectPath('input', 'music', backgroundMusic);
            if (fs.existsSync(musicInputPath)) {
                // console.log(`🎵 [STEP 4.5] Found background music: ${backgroundMusic}`);
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
                    logInfo(`[STEP 4.5] Auto-ducking applied successfully on track: ${backgroundMusic}`);
                } catch (duckError: any) {
                    logError(`[STEP 4.5] Auto-ducking failed, falling back to original music: ${duckError.message}`);
                    const targetPath = path.join(audioDir, backgroundMusic);
                    fs.copyFileSync(musicInputPath, targetPath);
                    resolvedMusicPath = toPublicRelativePath(targetPath);
                }
            } else {
                // console.log(`⚠️ [STEP 4.5] Background music file NOT FOUND: ${musicInputPath}`);
            }
        }

        const step4Time = Date.now() - step4Start;
        // console.log(`✅ [STEP 4] Generated ${audioFiles.size} voice tracks in ${step4Time}ms\n`);

        // ══════════════════════════════════════════════════════════════════
        // STEP 5: SAVE SCENE DATA (with actual audio durations)
        // ══════════════════════════════════════════════════════════════════
        // console.log('\n╔══════════════════════════════════════════╗');
        // console.log('║        STEP 5: SAVING SCENE DATA          ║');
        // console.log('╚══════════════════════════════════════════╝');

        const step5Start = Date.now();
        reportProgress('prepare', 90, 'Preparing scene data');

        // Build scene data with actual audio durations
        let totalActualDuration = 0;
        const scenesWithAudio = parsed.scenes.map((scene, index) => {
            const audioResult = audioFiles.get(scene.sceneNumber);
            const actualDuration = audioResult?.duration || scene.duration;
            totalActualDuration += actualDuration;

            return {
                ...scene,
                duration: actualDuration, // Use actual audio duration
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

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            // console.log(`📁 [STEP 5] Creating output directory: ${outputDir}`);
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const dataPath = path.join(outputDir, 'scene-data.json');
        const jsonData = JSON.stringify(sceneData, null, 2);
        fs.writeFileSync(dataPath, jsonData);

        const step5Time = Date.now() - step5Start;
        // console.log(`📄 [STEP 5] Scene data file: ${dataPath}`);
        // console.log(`📄 [STEP 5] File size: ${(jsonData.length / 1024).toFixed(2)} KB`);
        // console.log(`✅ [STEP 5] Saved in ${step5Time}ms\n`);

        // ══════════════════════════════════════════════════════════════════
        // STEP 6: GENERATE METADATA (Description & Hashtags)
        // ══════════════════════════════════════════════════════════════════
        // console.log('\n╔══════════════════════════════════════════╗');
        // console.log('║       STEP 6: GENERATING METADATA         ║');
        // console.log('╚══════════════════════════════════════════╝');

        const step6Start = Date.now();
        reportProgress('metadata', 95, 'Generating metadata');

        // Generate Description (First 3 sentences)
        // Split by periods but handle common abbreviations if possible, or just a simple split
        const sentences = parsed.scenes.map(s => s.voiceoverText).join(' ').split('. ');
        const description = sentences.slice(0, 3).join('. ') + (sentences.length > 3 ? '.' : '');

        // Generate Hashtags
        const uniqueKeywords = new Set<string>();
        parsed.scenes.forEach(scene => {
            scene.searchKeywords.forEach(k => uniqueKeywords.add(k.replace(/\s+/g, '').toLowerCase()));
        });
        // Add generic tags
        uniqueKeywords.add('ai');
        uniqueKeywords.add('future');
        uniqueKeywords.add('technology');

        const hashtags = Array.from(uniqueKeywords).map(k => `#${k}`).join(' ');

        const metadataContent = `${title || 'Video'}\n\n${description}\n\n${hashtags}`;

        // Sanitize title for filename (preserve spaces, remove illegal chars)
        const safeTitle = (title || 'video').replace(/[<>:"/\\|?*]/g, '').trim();
        const metadataPath = path.join(outputDir, `${safeTitle} details.txt`);
        fs.writeFileSync(metadataPath, metadataContent);

        const step6Time = Date.now() - step6Start;
        // console.log(`✅ [STEP 6] Metadata saved to: ${metadataPath}`);

        // ══════════════════════════════════════════════════════════════════
        // COMPLETE
        // ══════════════════════════════════════════════════════════════════
        const totalTime = Date.now() - totalStartTime;

        // console.log('\n╔════════════════════════════════════════════════════════════════╗');
        // console.log('║             ✅ PRE-PROCESSING COMPLETE!                        ║');
        // console.log('╚════════════════════════════════════════════════════════════════╝');
        // console.log('\n [TIMING SUMMARY]');
        // console.log(`   Step 1 (Validation): ${step1Time}ms`);
        // console.log(`   Step 2 (Parsing):    ${step2Time}ms`);
        // console.log(`   Step 3 (Visuals):    ${step3Time}ms`);
        // console.log(`   Step 4 (Audio):      ${step4Time}ms`);
        // console.log(`   Step 5 (Save Data):  ${step5Time}ms`);
        // console.log(`   ─────────────────────────────`);
        // console.log(`   TOTAL TIME:          ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s)`);
        // console.log('\n📋 Next Steps:');
        // console.log(`   1. Review: ${dataPath}`);
        // console.log('   2. Run: npm run remotion:render');
        // console.log('\n');

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

        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║                ❌ VIDEO GENERATION FAILED!                     ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.error(`\n❌ [ERROR] ${error.message}`);
        console.error(`❌ [ERROR] Stack trace:\n${error.stack}`);
        console.log(`\n⏱️ Failed after: ${totalTime}ms`);

        onProgress?.('error', 0, error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Update a specific scene in an existing job's scene-data.json
 * and regenerate the associated media (voice/visuals) if needed.
 */
export { deleteJobScene, reorderJobScenes, updateSceneInJob } from './infrastructure/pipeline/scene-editor';



