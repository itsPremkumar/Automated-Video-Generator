import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, renderStill } from '@remotion/renderer';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { cleanupAssets } from './lib/cleaner';
import { logError, logInfo, logWarn, writeProgress } from './shared/logging/runtime-logging';
import { resolveProjectPath, resolvePublicFilePath, resolveRuntimePublicPath } from './shared/runtime/paths';
import { createPipelineWorkspace, resolveAssetWorkspaceDir } from './pipeline-workspace';
import { JobCancellationError, isJobCancellationError } from './lib/job-cancellation';

const console = {
    log: (...args: unknown[]) => logInfo(...args),
    warn: (...args: unknown[]) => logWarn(...args),
    error: (...args: unknown[]) => logError(...args),
};

console.log('\n🎥 [RENDER] Module loaded (Segmented Mode)');
console.log(`🎥 [RENDER] Working directory: ${process.cwd()}`);

interface Scene {
    sceneNumber: number;
    duration: number;
    visualDescription: string;
    voiceoverText: string;
    searchKeywords: string[];
    visual?: {
        type: 'image' | 'video';
        url: string;
        width: number;
        height: number;
        localPath?: string;
        videoDuration?: number;
        videoTrimAfterFrames?: number;
    } | null;
    audioPath?: string;
}

interface SceneData {
    scenes: Scene[];
    totalDuration: number;
    style: string;
    orientation?: 'portrait' | 'landscape';
    title?: string;
    showText?: boolean;
    textConfig?: {
        color?: string;
        fontSize?: number;
        position?: 'top' | 'center' | 'bottom';
        animation?: 'fade' | 'slide' | 'zoom' | 'typewriter' | 'pop';
        background?: 'none' | 'box' | 'glass';
        glow?: boolean;
    };
    backgroundMusic?: string;
    musicVolume?: number;
    assetNamespace?: string;
}

interface RenderOptions {
    shouldCancel?: () => boolean;
}

function throwIfCancelled(shouldCancel?: () => boolean): void {
    if (shouldCancel?.()) {
        throw new JobCancellationError();
    }
}

function getChromiumOptions() {
    if (process.env.REMOTION_DISABLE_WEB_SECURITY === '1') {
        console.warn('[RENDER] REMOTION_DISABLE_WEB_SECURITY=1 detected. Chromium web security is disabled for this render.');
        return {
            disableWebSecurity: true,
        };
    }

    return undefined;
}

/**
 * Segmented Video Renderer
 * Renders video scene-by-scene for memory efficiency and crash recovery
 */
function logMemoryUsage(label: string): void {
    const usage = process.memoryUsage();
    const heapMB = Math.round(usage.heapUsed / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    const externalMB = Math.round(usage.external / 1024 / 1024);
    console.log(`🧠 [MEMORY] ${label}: heap=${heapMB}MB rss=${rssMB}MB external=${externalMB}MB`);

    if (heapMB > 512) {
        console.warn(`🧠 [MEMORY] ⚠ HIGH HEAP USAGE (${heapMB}MB) — risk of OOM crash`);
    }
}

export const renderVideo = async (outputDir: string = resolveProjectPath('output'), options: RenderOptions = {}) => {
    const totalStartTime = Date.now();
    const { shouldCancel } = options;

    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║         🎥 SEGMENTED REMOTION RENDER PIPELINE                  ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`\n🎥 [RENDER] Start time: ${new Date().toISOString()}`);
    logMemoryUsage('Render pipeline start');

    // Fix for Windows: Avoid spaces in system TEMP path (e.g. "PREM KUMAR")
    // by pointing REMOTION_TMPDIR to a local project-relative folder.
    const localTmpDir = resolveProjectPath('tmp', 'remotion');
    if (!fs.existsSync(localTmpDir)) {
        fs.mkdirSync(localTmpDir, { recursive: true });
    }
    process.env.REMOTION_TMPDIR = localTmpDir;
    console.log(`🛠️  [RENDER] Using local temp directory: ${localTmpDir}`);

    let bundleLocation: string | undefined;
    let assetWorkspaceDir: string | undefined;
    let renderCompleted = false;
    const segmentsDir = path.join(outputDir, 'segments');

    try {
        throwIfCancelled(shouldCancel);
        // ══════════════════════════════════════════════════════════════════
        // STEP 1: LOAD SCENE DATA
        // ══════════════════════════════════════════════════════════════════
        console.log('\n╔══════════════════════════════════════════╗');
        console.log('║         STEP 1: LOADING SCENE DATA        ║');
        console.log('╚══════════════════════════════════════════╝');

        const sceneDataPath = path.join(outputDir, 'scene-data.json');

        if (!fs.existsSync(sceneDataPath)) {
            throw new Error(`Scene data file not found: ${sceneDataPath}`);
        }

        const fileContent = fs.readFileSync(sceneDataPath, 'utf8');
        const sceneData: SceneData = JSON.parse(fileContent);
        throwIfCancelled(shouldCancel);
        assetWorkspaceDir = sceneData.assetNamespace
            ? resolveAssetWorkspaceDir(sceneData.assetNamespace)
            : createPipelineWorkspace(outputDir).workspaceDir;

        console.log(`📋 [RENDER] Loaded ${sceneData.scenes.length} scenes`);
        console.log(`📋 [RENDER] Total duration: ${sceneData.totalDuration}s`);

        const fps = 30;
        const isLandscape = sceneData.orientation === 'landscape';
        const width = isLandscape ? 1920 : 1080;
        const height = isLandscape ? 1080 : 1350;

        // ══════════════════════════════════════════════════════════════════
        // STEP 2: BUNDLE REMOTION PROJECT (ONCE)
        // ══════════════════════════════════════════════════════════════════
        console.log('\n╔══════════════════════════════════════════╗');
        console.log('║      STEP 2: BUNDLING PROJECT (ONCE)      ║');
        console.log('╚══════════════════════════════════════════╝');

        const bundleStart = Date.now();
        const entryPoint = resolveProjectPath('remotion', 'index.ts');

        if (!fs.existsSync(entryPoint)) {
            throw new Error(`Entry point not found: ${entryPoint}`);
        }

        const publicDir = resolveRuntimePublicPath();
        console.log('📦 [RENDER] Bundling with Webpack...');
        console.log(`📦 [RENDER] Public directory (staticFile root): ${publicDir}`);

        bundleLocation = await bundle({
            entryPoint,
            publicDir,
        });

        console.log(`✅ [RENDER] Bundle complete in ${Date.now() - bundleStart}ms`);

        // ══════════════════════════════════════════════════════════════════
        // STEP 3: CREATE SEGMENTS DIRECTORY
        // ══════════════════════════════════════════════════════════════════
        console.log('\n╔══════════════════════════════════════════╗');
        console.log('║       STEP 3: PREPARING SEGMENTS DIR      ║');
        console.log('╚══════════════════════════════════════════╝');

        if (!fs.existsSync(segmentsDir)) {
            fs.mkdirSync(segmentsDir, { recursive: true });
        }

        // Check for existing segments (resume capability)
        const existingSegments = fs.readdirSync(segmentsDir)
            .filter(f => f.startsWith('segment_') && f.endsWith('.mp4'));

        if (existingSegments.length > 0) {
            console.log(`📂 [RENDER] Found ${existingSegments.length} existing segments (resume mode)`);
        }

        // ══════════════════════════════════════════════════════════════════
        // STEP 4: RENDER THUMBNAIL (from first scene)
        // ══════════════════════════════════════════════════════════════════
        console.log('\n╔══════════════════════════════════════════╗');
        console.log('║       STEP 4: RENDERING THUMBNAIL         ║');
        console.log('╚══════════════════════════════════════════╝');

        const thumbnailLocation = path.join(outputDir, 'thumbnail.jpg');

        if (!fs.existsSync(thumbnailLocation)) {
            throwIfCancelled(shouldCancel);
            const firstScene = sceneData.scenes[0];
            const thumbnailComposition = await selectComposition({
                serveUrl: bundleLocation,
                id: 'SingleScene',
                inputProps: {
                    scene: firstScene,
                    isFirstScene: true,
                    isLastScene: false,
                    showText: sceneData.showText !== false,
                    textConfig: sceneData.textConfig,
                    backgroundMusic: sceneData.backgroundMusic,
                    musicVolume: sceneData.musicVolume,
                    globalStartFrame: 0,
                },
            });

            thumbnailComposition.width = width;
            thumbnailComposition.height = height;
            thumbnailComposition.durationInFrames = Math.round(firstScene.duration * fps);

            await renderStill({
                composition: thumbnailComposition,
                serveUrl: bundleLocation,
                output: thumbnailLocation,
                frame: Math.min(30, Math.floor(thumbnailComposition.durationInFrames / 2)),
                inputProps: {
                    scene: firstScene,
                    isFirstScene: true,
                    isLastScene: false,
                    showText: sceneData.showText !== false,
                    textConfig: sceneData.textConfig,
                    backgroundMusic: sceneData.backgroundMusic,
                    musicVolume: sceneData.musicVolume,
                    globalStartFrame: 0,
                },
            });

            console.log(`✅ [RENDER] Thumbnail saved: ${thumbnailLocation}`);
        } else {
            console.log(`⏭️ [RENDER] Thumbnail already exists, skipping`);
        }

        // ══════════════════════════════════════════════════════════════════
        // STEP 5: RENDER EACH SCENE AS SEGMENT
        // ══════════════════════════════════════════════════════════════════
        console.log('\n╔══════════════════════════════════════════╗');
        console.log('║      STEP 5: RENDERING SCENE SEGMENTS     ║');
        console.log('╚══════════════════════════════════════════╝');

        const segments: string[] = [];
        let renderedCount = 0;
        let skippedCount = 0;
        let failedCount = 0;
        const failedScenes: number[] = [];
        let cumulativeFrames = 0;

        for (let i = 0; i < sceneData.scenes.length; i++) {
            throwIfCancelled(shouldCancel);
            const scene = sceneData.scenes[i];
            const segmentFilename = `segment_${String(i + 1).padStart(3, '0')}.mp4`;
            const segmentPath = path.join(segmentsDir, segmentFilename);
            const sceneDurationFrames = Math.round(scene.duration * fps);
            const globalStartFrame = cumulativeFrames;

            // RESUME CAPABILITY: Skip if segment already exists
            if (fs.existsSync(segmentPath)) {
                const stats = fs.statSync(segmentPath);
                if (stats.size > 10000) {  // At least 10KB
                    console.log(`⏭️ Scene ${i + 1}/${sceneData.scenes.length} - Already rendered, skipping`);
                    segments.push(segmentPath);
                    cumulativeFrames += sceneDurationFrames;
                    skippedCount++;
                    continue;
                }
            }

            logMemoryUsage(`Before scene ${i + 1}`);
            const sceneStart = Date.now();
            const isFirstScene = i === 0;
            const isLastScene = i === sceneData.scenes.length - 1;

            console.log(`\n🎬 Scene ${i + 1}/${sceneData.scenes.length}: "${scene.voiceoverText.substring(0, 40)}..."`);
            console.log(`   Duration: ${scene.duration}s (${sceneDurationFrames} frames)`);

            try {
                // SAFETY CHECK: Ensure visual asset exists
                if (scene.visual && scene.visual.localPath) {
                    const absVisualPath = resolvePublicFilePath(scene.visual.localPath);
                    if (!fs.existsSync(absVisualPath)) {
                        console.warn(`\n   ⚠️ [WARNING] Visual asset missing: ${scene.visual.localPath}`);
                        console.warn(`   ⚠️ Switching to fallback background for this scene.`);
                        scene.visual = null;
                    }
                }

                // SAFETY CHECK: Ensure audio asset exists
                if (scene.audioPath) {
                    let absAudioPath = scene.audioPath;
                    if (!path.isAbsolute(absAudioPath)) {
                        absAudioPath = resolvePublicFilePath(scene.audioPath);
                    }

                    if (!fs.existsSync(absAudioPath)) {
                        console.warn(`\n   ⚠️ [WARNING] Audio asset missing: ${path.basename(scene.audioPath)}`);
                        console.warn(`   ⚠️ Process will continue without audio for this scene.`);
                        scene.audioPath = undefined;
                    }
                }

                // Select composition for this scene
                const composition = await selectComposition({
                    serveUrl: bundleLocation,
                    id: 'SingleScene',
                    inputProps: {
                        scene,
                        isFirstScene,
                        isLastScene,
                        showText: sceneData.showText !== false,
                        textConfig: sceneData.textConfig,
                        backgroundMusic: sceneData.backgroundMusic,
                        musicVolume: sceneData.musicVolume,
                        globalStartFrame,
                    },
                });

                // Override dimensions for this scene
                composition.width = width;
                composition.height = height;
                composition.durationInFrames = sceneDurationFrames;

                // Render the segment
                await renderMedia({
                    composition,
                    serveUrl: bundleLocation,
                    codec: 'h264',
                    outputLocation: segmentPath,
                    inputProps: {
                        scene,
                        isFirstScene,
                        isLastScene,
                        showText: sceneData.showText !== false,
                        textConfig: sceneData.textConfig,
                        backgroundMusic: sceneData.backgroundMusic,
                        musicVolume: sceneData.musicVolume,
                        globalStartFrame,
                    },
                    crf: 18,
                    timeoutInMilliseconds: 300000,  // 5 min per scene max
                    concurrency: 1,
                    chromiumOptions: getChromiumOptions(),
                    onProgress: ({ progress }) => {
                        throwIfCancelled(shouldCancel);
                        const percent = Math.round(progress * 100);
                        writeProgress(`\r   ⏳ Progress: ${percent}%`);
                    }
                });
                throwIfCancelled(shouldCancel);

                const sceneTime = Date.now() - sceneStart;
                const stats = fs.statSync(segmentPath);
                console.log(`\n   ✅ Saved: ${segmentFilename} (${(stats.size / 1024 / 1024).toFixed(2)} MB) in ${(sceneTime / 1000).toFixed(1)}s`);

                segments.push(segmentPath);
                cumulativeFrames += sceneDurationFrames;
                renderedCount++;

            } catch (sceneError: any) {
                // Per-scene crash isolation: log the failure and continue to the next scene
                // instead of crashing the entire render pipeline.
                if (isJobCancellationError(sceneError)) {
                    throw sceneError; // Always respect cancellation
                }

                failedCount++;
                failedScenes.push(i + 1);
                cumulativeFrames += sceneDurationFrames;
                console.error(`\n   ❌ Scene ${i + 1} failed: ${sceneError.message}`);
                console.error(`   Stack: ${sceneError.stack?.split('\n').slice(0, 3).join('\n')}`);

                // Clean up partial segment file if it exists
                try {
                    if (fs.existsSync(segmentPath)) {
                        fs.unlinkSync(segmentPath);
                    }
                } catch { /* ignore cleanup errors */ }

                // If more than half the scenes fail, abort the render
                if (failedCount > Math.ceil(sceneData.scenes.length / 2)) {
                    throw new Error(`Too many scene render failures (${failedCount}/${sceneData.scenes.length}). Aborting render. Failed scenes: ${failedScenes.join(', ')}`);
                }

                console.log(`   💡 Continuing to next scene (${failedCount} failed so far)`);
            }
        }

        console.log(`\n📊 [RENDER] Rendered: ${renderedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}, Total segments: ${segments.length}`);
        if (failedScenes.length > 0) {
            console.warn(`⚠️ [RENDER] Failed scenes: ${failedScenes.join(', ')} — these will be missing from the final video`);
        }

        // ══════════════════════════════════════════════════════════════════
        // STEP 6: CONCATENATE ALL SEGMENTS
        // ══════════════════════════════════════════════════════════════════
        console.log('\n╔══════════════════════════════════════════╗');
        console.log('║      STEP 6: CONCATENATING SEGMENTS       ║');
        console.log('╚══════════════════════════════════════════╝');

        const videoTitle = sceneData.title || 'video';
        const safeFilename = videoTitle.replace(/[<>:"/\\|?*]/g, '').trim();
        const finalOutput = path.join(outputDir, `${safeFilename}.mp4`);
        throwIfCancelled(shouldCancel);

        // Filter out any segments that don't exist (from failed scenes)
        const validSegments = segments.filter((segmentPath) => {
            if (!fs.existsSync(segmentPath)) {
                console.warn(`⚠️ [RENDER] Skipping missing segment: ${path.basename(segmentPath)}`);
                return false;
            }
            return true;
        });

        if (validSegments.length === 0) {
            throw new Error('No valid segments to concatenate. All scenes failed to render.');
        }

        console.log(`🔗 [RENDER] Concatenating ${validSegments.length} valid segments (${failedCount} skipped due to failures)...`);

        // Create FFmpeg concat list
        const concatListPath = path.join(segmentsDir, 'segments.txt');
        const concatList = validSegments
            .map((segmentPath) => `file '${segmentPath.replace(/\\/g, '/')}'`)
            .join('\n');
        fs.writeFileSync(concatListPath, concatList);

        // Run FFmpeg concat (lossless copy)
        // Detect FFmpeg path - try to use ffmpeg-static
        let ffmpegPath = 'ffmpeg';
        try {
            const ffmpegStatic = require('ffmpeg-static');
            if (ffmpegStatic) ffmpegPath = ffmpegStatic;
        } catch (e) {
            console.log('⚠️ [RENDER] Could not resolve ffmpeg-static, falling back to global command');
        }

        console.log(`   🛠️  Using FFmpeg: ${ffmpegPath}`);

        const ffmpegCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${concatListPath}" -c copy "${finalOutput}"`;

        try {
            execSync(ffmpegCmd, {
                stdio: 'pipe'
            });
        } catch (ffmpegError: any) {
            // Try with re-encoding if concat copy fails
            console.log('⚠️ [RENDER] Lossless concat failed, trying with re-encode...');
            throwIfCancelled(shouldCancel);
            const ffmpegReencodeCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${concatListPath}" -c:v libx264 -crf 18 -c:a aac "${finalOutput}"`;

            try {
                execSync(ffmpegReencodeCmd, {
                    stdio: 'pipe'
                });
            } catch (reencodeError: any) {
                console.error(`❌ [RENDER] FFmpeg failed: ${reencodeError.message}`);
                throw reencodeError;
            }
        }

        // Get final file info
        const finalStats = fs.statSync(finalOutput);
        const finalSizeMB = (finalStats.size / 1024 / 1024).toFixed(2);

        console.log(`✅ [RENDER] Final video: ${finalOutput}`);
        console.log(`📊 [RENDER] File size: ${finalSizeMB} MB`);

        // ══════════════════════════════════════════════════════════════════
        // STEP 7: CLEANUP SEGMENTS
        // ══════════════════════════════════════════════════════════════════
        console.log('\n╔══════════════════════════════════════════╗');
        console.log('║         STEP 7: CLEANING UP               ║');
        console.log('╚══════════════════════════════════════════╝');

        // Delete segment files
        for (const segment of validSegments) {
            try {
                fs.unlinkSync(segment);
            } catch (e) {
                // Ignore cleanup errors
            }
        }

        // Delete concat list
        try {
            fs.unlinkSync(concatListPath);
            fs.rmdirSync(segmentsDir);
        } catch (e) {
            // Ignore cleanup errors
        }

        console.log(`🧹 [RENDER] Cleaned up ${validSegments.length} segment files`);
        renderCompleted = true;

        // ══════════════════════════════════════════════════════════════════
        // COMPLETE
        // ══════════════════════════════════════════════════════════════════
        const totalTime = Date.now() - totalStartTime;

        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║                    🎉 RENDER COMPLETE!                          ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.log(`\n📊 [SUMMARY]`);
        console.log(`   Total scenes: ${sceneData.scenes.length}`);
        console.log(`   Total time: ${(totalTime / 1000 / 60).toFixed(1)} minutes`);
        console.log(`   Output: ${finalOutput}`);
        console.log(`   Size: ${finalSizeMB} MB`);
        console.log(`   Duration: ${sceneData.totalDuration}s`);
        console.log('\n');

    } catch (err: any) {
        const totalTime = Date.now() - totalStartTime;

        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║                    ❌ RENDER FAILED!                            ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');

        const errorMessage = err.message || String(err);
        console.error(`\n❌ [RENDER] Error: ${errorMessage}`);

        // Check segment progress
        if (fs.existsSync(segmentsDir)) {
            const completedSegments = fs.readdirSync(segmentsDir)
                .filter(f => f.startsWith('segment_') && f.endsWith('.mp4'));
            console.log(`\n💾 [RECOVERY] ${completedSegments.length} segments saved to disk`);
            console.log(`💡 [RECOVERY] Run again to resume from last completed segment`);
        }

        console.error(`\n❌ [RENDER] Stack trace:\n${err.stack}`);
        console.log(`\n⏱️ Failed after: ${(totalTime / 1000).toFixed(1)}s`);

        throw err;
    } finally {
        // Cleanup assets regardless of success/failure
        await runCleanup(bundleLocation, renderCompleted ? assetWorkspaceDir : undefined);
    }
};

const runCleanup = async (bundleLocation?: string, assetWorkspaceDir?: string) => {
    const dirsToClean: string[] = [];

    if (assetWorkspaceDir) {
        dirsToClean.push(assetWorkspaceDir);
    }

    if (bundleLocation) {
        dirsToClean.push(bundleLocation);
    }

    if (dirsToClean.length > 0) {
        await cleanupAssets(dirsToClean);
    }
}


if (require.main === module) {
    renderVideo();
}
