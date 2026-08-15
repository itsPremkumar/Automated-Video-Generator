/**
 * ai/intelligence/storyboard.ts — AI storyboard keyframe generation.
 *
 * For each scene in the script, generates a keyframe image that
 * visualizes what the scene should look like.
 * These keyframes then seed I2V for motion clips.
 *
 * Identity-preserving: returns empty array if generation fails.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo } from '../../../shared/logging/runtime-logging.js';
import { generateImage } from '../providers/comfyui.js';

export interface StoryboardResult {
    sceneIndex: number;
    keyframePath: string;
    prompt: string;
}

/** Check if storyboard generation is available. */
export function isEnabled(): boolean {
    return true;
}

/**
 * Generate keyframes for all scenes in a script.
 * Returns array of StoryboardResult or empty array on failure.
 */
export async function generate(opts: {
    title: string;
    scenes: { voiceoverText: string; searchKeywords: string[] }[];
    outDir: string;
    orientation?: 'portrait' | 'landscape' | 'square';
}): Promise<StoryboardResult[]> {
    fs.mkdirSync(opts.outDir, { recursive: true });
    const results: StoryboardResult[] = [];

    for (let i = 0; i < opts.scenes.length; i++) {
        const scene = opts.scenes[i];
        const prompt = buildStoryboardPrompt(opts.title, scene.voiceoverText, scene.searchKeywords, opts.orientation || 'landscape');
        const filename = `storyboard_scene_${i + 1}.png`;

        try {
            const keyframePath = await generateImage({
                prompt,
                outDir: opts.outDir,
                filename,
                orientation: opts.orientation || 'landscape',
            });

            if (keyframePath && fs.existsSync(keyframePath)) {
                results.push({ sceneIndex: i, keyframePath, prompt });
                logInfo(`[STORYBOARD] Generated keyframe for scene ${i + 1}`);
            }
        } catch (e: any) {
            logInfo(`[STORYBOARD] Failed for scene ${i + 1}: ${e?.message ?? e}`);
        }
    }

    return results;
}

function buildStoryboardPrompt(
    title: string,
    narration: string,
    keywords: string[],
    orientation: string,
): string {
    const kw = keywords.slice(0, 5).join(', ');
    const aspect = orientation === 'landscape' ? '16:9 cinematic' : orientation === 'square' ? '1:1 square' : '9:16 vertical';
    return `A high-quality cinematic keyframe for: "${title}". Scene depicts: ${kw || narration}. ${aspect} composition, no text, no watermark, photorealistic, dramatic lighting.`;
}
