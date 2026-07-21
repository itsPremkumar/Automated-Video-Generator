/**
 * src/music-system/processing/index.ts
 * Processing pipeline — trim → fade → normalize → loop.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ProcessingOptions, ProcessingResult, MusicRole } from '../types';
import { probeDuration } from '../providers/base';
import { trimAudio } from './trim';
import { applyFade } from './fade';
import { normalizeLoudness } from './normalize';
import { loopAudio } from './looper';

export class ProcessingPipeline {
    constructor(private config: ProcessingOptions) {}

    async run(
        inputPath: string,
        outputPath: string,
        opts: { role: MusicRole; targetDurationSec: number },
    ): Promise<ProcessingResult> {
        let current = inputPath;
        const workDir = path.dirname(outputPath);
        fs.mkdirSync(workDir, { recursive: true });

        const result: ProcessingResult = {
            trimmed: false,
            faded: false,
            normalized: false,
            looped: false,
            originalDurationSec: await probeDuration(inputPath),
            finalDurationSec: 0,
        };

        // Stage 1: Trim to target duration
        if (this.config.trimToDuration) {
            const trimmedPath = path.join(workDir, `__trim_${path.basename(outputPath)}`);
            try {
                await trimAudio(current, trimmedPath, opts.targetDurationSec);
                current = trimmedPath;
                result.trimmed = true;
            } catch (e: any) {
                console.warn(`  ⚠ Trim skipped: ${e.message}`);
            }
        }

        // Stage 2: Apply fade
        if (this.config.applyFade) {
            const fadedPath = path.join(workDir, `__fade_${path.basename(outputPath)}`);
            try {
                await applyFade(current, fadedPath, {
                    fadeInSec: opts.role === 'intro' ? 0.2 : this.config.fadeInSec,
                    fadeOutSec: this.config.fadeOutSec,
                    totalDurationSec: opts.targetDurationSec,
                });
                current = fadedPath;
                result.faded = true;
            } catch (e: any) {
                console.warn(`  ⚠ Fade skipped: ${e.message}`);
            }
        }

        // Stage 3: Normalize loudness
        if (this.config.normalizeLoudness) {
            const normPath = path.join(workDir, `__norm_${path.basename(outputPath)}`);
            try {
                await normalizeLoudness(current, normPath, this.config.targetLufs);
                current = normPath;
                result.normalized = true;
            } catch (e: any) {
                console.warn(`  ⚠ Normalize skipped: ${e.message}`);
            }
        }

        // Stage 4: Loop if too short
        if (this.config.enableLooping) {
            const currentDur = await probeDuration(current);
            if (currentDur > 0 && currentDur < opts.targetDurationSec * 0.8) {
                const loopedPath = path.join(workDir, `__loop_${path.basename(outputPath)}`);
                try {
                    await loopAudio(current, loopedPath, opts.targetDurationSec);
                    current = loopedPath;
                    result.looped = true;
                } catch (e: any) {
                    console.warn(`  ⚠ Loop skipped: ${e.message}`);
                }
            }
        }

        // Finalize: move to output path
        if (current !== outputPath) {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            fs.renameSync(current, outputPath);
        }

        result.finalDurationSec = await probeDuration(outputPath);
        return result;
    }
}

export { trimAudio } from './trim';
export { applyFade } from './fade';
export { normalizeLoudness } from './normalize';
export { loopAudio } from './looper';
