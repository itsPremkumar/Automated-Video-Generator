import * as fs from 'fs';
import * as path from 'path';
import { generateVideo } from '../video-generator';
import { renderVideo } from '../render';
import { jobStore, resolveProjectPath } from '../runtime';
import { sanitizeFolderTitle, findVideoFile } from './video.service';
import { DEFAULT_FALLBACK_VIDEO } from '../constants/config';
import { Orientation } from '../types/server.types';

export async function createAndRunJob(
    jobId: string, 
    publicId: string, 
    title: string, 
    script: string, 
    options: {
        orientation: Orientation;
        language: string;
        voice?: string;
        showText: boolean;
        backgroundMusic: string;
        defaultVideo?: string;
    }
) {
    const outputDir = resolveProjectPath('output', publicId);
    fs.mkdirSync(outputDir, { recursive: true });

    jobStore.set(jobId, {
        title,
        publicId,
        status: 'pending',
        progress: 0,
        message: 'Queued for processing.',
    });

    // Run in background
    (async () => {
        try {
            jobStore.set(jobId, { status: 'processing', progress: 5, message: 'Generating assets and voiceover.' });

            const result = await generateVideo(script, outputDir, {
                title,
                orientation: options.orientation,
                language: options.language,
                voice: options.voice,
                showText: options.showText,
                defaultVideo: options.defaultVideo || DEFAULT_FALLBACK_VIDEO,
                backgroundMusic: options.backgroundMusic,
                onProgress: (step: string, percent: number, message: string) => {
                    jobStore.set(jobId, {
                        status: 'processing',
                        progress: 5 + Math.round((percent / 100) * 60),
                        message: `${step}: ${message}`,
                    });
                },
            });

            if (!result.success) {
                jobStore.set(jobId, {
                    status: 'failed',
                    progress: 100,
                    message: 'Generation failed before render.',
                    error: result.error || 'Unknown generation error.',
                    errorDetails: (result as any).errorDetails || result.error || 'Unknown generation error.',
                    endTime: Date.now(),
                });
                return;
            }

            jobStore.set(jobId, { status: 'processing', progress: 75, message: 'Rendering final MP4.' });
            await renderVideo(outputDir);

            const finalVideo = findVideoFile(outputDir);
            if (!finalVideo) {
                jobStore.set(jobId, {
                    status: 'failed',
                    progress: 100,
                    message: 'Render finished without a final MP4.',
                    error: 'No final video file found.',
                    errorDetails: 'The Remotion process completed but output directory ' + outputDir + ' is missing the MP4 file.',
                    endTime: Date.now(),
                });
                return;
            }

            jobStore.set(jobId, {
                status: 'completed',
                progress: 100,
                message: 'Video ready for playback and download.',
                outputPath: path.join(outputDir, finalVideo),
                endTime: Date.now(),
            });
        } catch (error: any) {
            jobStore.set(jobId, {
                status: 'failed',
                progress: 100,
                message: 'A fatal error occurred while processing the job.',
                error: error?.message || 'Unknown server error.',
                errorDetails: (error?.stack || String(error)) + (error?.stderr ? '\n\nSTDERR:\n' + error.stderr.toString() : '') + (error?.stdout ? '\n\nSTDOUT:\n' + error.stdout.toString() : ''),
                endTime: Date.now(),
            });
        }
    })();
}
