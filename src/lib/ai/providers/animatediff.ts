/**
 * ai/providers/animatediff.ts — local image-to-video via AnimateDiff.
 *
 * Connects to ComfyUI with AnimateDiff extension.
 * Turns a static image into a 2-4 second motion clip.
 *
 * Identity-preserving: returns '' when AnimateDiff not available.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo } from '../../../shared/logging/runtime-logging.js';
import { isComfyUiAvailable } from './comfyui.js';

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
const ANIMATEDIFF_TIMEOUT = Math.max(60000, Number(process.env.ANIMATEDIFF_TIMEOUT_MS || 600000));

/** Check if AnimateDiff is available. */
export async function isAvailable(): Promise<boolean> {
    if (!await isComfyUiAvailable()) return false;
    try {
        const res = await fetch(`${COMFYUI_URL}/object_info`);
        if (!res.ok) return false;
        const info = await res.json();
        // Check for AnimateDiff nodes
        return Object.keys(info).some(k => k.includes('AnimateDiff') || k.includes('ADE_'));
    } catch {
        return false;
    }
}

/** Check if I2V is enabled. */
export function isEnabled(): boolean {
    return true;
}

/**
 * Generate motion from a static image.
 * Returns local mp4 path or '' on failure.
 */
export async function generateMotion(opts: {
    imagePath: string;
    outDir: string;
    filename: string;
    motionPrompt?: string;
    orientation?: 'portrait' | 'landscape' | 'square';
    durationSec?: number;
}): Promise<string> {
    if (!await isAvailable()) {
        logInfo('[ANIMATEDIFF] Not available — falling back');
        return '';
    }

    if (!fs.existsSync(opts.imagePath)) {
        logInfo('[ANIMATEDIFF] Source image not found');
        return '';
    }

    fs.mkdirSync(opts.outDir, { recursive: true });
    const dest = path.join(opts.outDir, opts.filename);

    try {
        // Upload image to ComfyUI
        const imgBuffer = fs.readFileSync(opts.imagePath);
        const formData = new FormData();
        const blob = new Blob([imgBuffer], { type: 'image/png' });
        formData.append('image', blob, path.basename(opts.imagePath));

        const uploadRes = await fetch(`${COMFYUI_URL}/upload/image`, {
            method: 'POST',
            body: formData,
        });
        if (!uploadRes.ok) return '';
        const uploadJson = await uploadRes.json();
        const uploadedName = uploadJson?.name;
        if (!uploadedName) return '';

        // Build AnimateDiff workflow
        const workflow = buildAnimateDiffWorkflow(uploadedName, opts);

        // Submit prompt
        const promptRes = await fetch(`${COMFYUI_URL}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: workflow }),
        });
        if (!promptRes.ok) return '';
        const { prompt_id } = await promptRes.json();
        if (!prompt_id) return '';

        // Poll for result
        const outputPath = await pollForVideoResult(prompt_id, dest, ANIMATEDIFF_TIMEOUT);
        return outputPath && fs.existsSync(outputPath) ? outputPath : '';
    } catch (e: any) {
        logInfo(`[ANIMATEDIFF] Generation failed: ${e?.message ?? e}`);
        return '';
    }
}

function buildAnimateDiffWorkflow(imageName: string, opts: any): any {
    const frames = Math.min(48, Math.max(12, (opts.durationSec || 3) * 16));
    return {
        "1": { "class_type": "LoadImage", "inputs": { "image": imageName, "type": "input" } },
        "2": { "class_type": "ADE_AnimateDiffLoaderWithContext", "inputs": { "model_name": "mm_sd_v15.ckpt", "beta_schedule": "sqrt_linear", "motion_scale": 1.2 } },
        "3": { "class_type": "ADE_AnimateDiffUniformContextOptions", "inputs": { "context_length": 16, "context_stride": 1, "context_overlap": 4 } },
        "4": { "class_type": "ADE_AnimateDiffApply", "inputs": { "motion_model": ["2", 0], "context_options": ["3", 0] } },
        "5": { "class_type": "CLIPTextEncode", "inputs": { "text": opts.motionPrompt || 'smooth camera movement, subtle motion, cinematic', "clip": ["4", 1] } },
        "6": { "class_type": "CLIPTextEncode", "inputs": { "text": 'static, frozen, still image', "clip": ["4", 1] } },
        "7": { "class_type": "KSampler", "inputs": { "seed": opts.seed ?? 42, "steps": 20, "cfg": 7, "sampler_name": 'euler', "scheduler": 'normal', "denoise": 0.8, "model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["1", 0] } },
        "8": { "class_type": "VHS_VideoCombine", "inputs": { "images": ["7", 0], "frame_rate": 16, "loop_count": 0, "filename_prefix": "animatediff", "format": "video/h264-mp4" } }
    };
}

async function pollForVideoResult(promptId: string, dest: string, timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${COMFYUI_URL}/history/${promptId}`);
            if (!res.ok) { await new Promise(r => setTimeout(r, 2000)); continue; }
            const history = await res.json();
            const outputs = history?.[promptId]?.outputs;
            if (outputs) {
                const node = outputs["8"];
                const videos = node?.gifs || node?.videos;
                if (videos && videos.length > 0) {
                    const videoRes = await fetch(`${COMFYUI_URL}/view?filename=${videos[0].filename}&type=output`);
                    if (videoRes.ok) {
                        fs.writeFileSync(dest, Buffer.from(await videoRes.arrayBuffer()));
                        return dest;
                    }
                }
            }
        } catch { /* keep polling */ }
        await new Promise(r => setTimeout(r, 2000));
    }
    return '';
}
