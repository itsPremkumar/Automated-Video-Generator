/**
 * ai/providers/comfyui.ts — local image generation via ComfyUI.
 *
 * Connects to a local ComfyUI server (localhost:8188).
 * Supports SD1.5 (fast) and SDXL (quality).
 * Uses --lowvram mode for 6GB RAM hardware.
 *
 * Identity-preserving: returns '' when ComfyUI is unreachable.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo } from '../../../shared/logging/runtime-logging.js';

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
const COMFYUI_TIMEOUT = Math.max(30000, Number(process.env.COMFYUI_TIMEOUT_MS || 300000));
const DEFAULT_MODEL = process.env.COMFYUI_MODEL || 'sd15'; // 'sd15' | 'sdxl' | custom

interface ComfyUiRequest {
    prompt: string;
    negativePrompt?: string;
    width: number;
    height: number;
    steps: number;
    cfg: number;
    sampler?: string;
    seed?: number;
}

const MODEL_CONFIGS: Record<string, { steps: number; cfg: number; sampler: string }> = {
    sd15: { steps: 20, cfg: 7, sampler: 'euler' },
    sdxl: { steps: 30, cfg: 7, sampler: 'euler_ancestral' },
};

function getModelConfig(): { steps: number; cfg: number; sampler: string } {
    return MODEL_CONFIGS[DEFAULT_MODEL] || MODEL_CONFIGS.sd15;
}

/** Check if ComfyUI is reachable. */
export async function isComfyUiAvailable(): Promise<boolean> {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`${COMFYUI_URL}/system_stats`, { signal: ctrl.signal });
        clearTimeout(t);
        return res.ok;
    } catch {
        return false;
    }
}

/** Check if image generation is possible (ComfyUI running). */
export function isEnabled(): boolean {
    // Don't block startup; availability is checked at generate time
    return true;
}

/** Get queue info from ComfyUI. */
async function getQueueInfo(): Promise<{ running: number; pending: number }> {
    try {
        const res = await fetch(`${COMFYUI_URL}/queue`);
        if (!res.ok) return { running: 0, pending: 0 };
        const j = await res.json();
        return {
            running: j?.queue_running?.length || 0,
            pending: j?.queue_pending?.length || 0,
        };
    } catch {
        return { running: 0, pending: 0 };
    }
}

/** Submit a generation job to ComfyUI and wait for result. */
export async function generateImage(opts: {
    prompt: string;
    outDir: string;
    filename: string;
    orientation?: 'portrait' | 'landscape' | 'square';
    negativePrompt?: string;
    seed?: number;
}): Promise<string> {
    if (!await isComfyUiAvailable()) {
        logInfo('[COMFYUI] Server not reachable — falling back');
        return '';
    }

    fs.mkdirSync(opts.outDir, { recursive: true });
    const dest = path.join(opts.outDir, opts.filename);

    // Calculate dimensions based on orientation
    const dims = opts.orientation === 'landscape'
        ? { width: 832, height: 480 }  // ~16:9, ComfyUI-friendly
        : opts.orientation === 'square'
            ? { width: 512, height: 512 }
            : { width: 480, height: 832 }; // portrait ~9:16

    const config = getModelConfig();

    const request: ComfyUiRequest = {
        prompt: opts.prompt,
        negativePrompt: opts.negativePrompt || 'text, watermark, low quality, blurry',
        width: dims.width,
        height: dims.height,
        steps: config.steps,
        cfg: config.cfg,
        sampler: config.sampler,
        seed: opts.seed ?? Math.floor(Math.random() * 2147483647),
    };

    try {
        // Use ComfyUI's simple API (text-to-image)
        const res = await fetch(`${COMFYUI_URL}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: buildSimpleWorkflow(request),
            }),
        });

        if (!res.ok) {
            logInfo(`[COMFYUI] Server returned ${res.status} — falling back`);
            return '';
        }

        const result = await res.json();
        const promptId = result?.prompt_id;
        if (!promptId) return '';

        // Poll for completion
        const outputPath = await pollForResult(promptId, dest, COMFYUI_TIMEOUT);
        return outputPath && fs.existsSync(outputPath) ? outputPath : '';
    } catch (e: any) {
        logInfo(`[COMFYUI] Generation failed: ${e?.message ?? e}`);
        return '';
    }
}

/** Build a simple ComfyUI workflow JSON. */
function buildSimpleWorkflow(req: ComfyUiRequest): any {
    // Simple SD1.5/SDXL workflow
    return {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": req.seed ?? 42,
                "steps": req.steps,
                "cfg": req.cfg,
                "sampler_name": req.sampler,
                "scheduler": "normal",
                "denoise": 1,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0]
            }
        },
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": { "ckpt_name": DEFAULT_MODEL === 'sdxl' ? 'sd_xl_base_1.0.safetensors' : 'v1-5-pruned-emaonly.ckpt' }
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": { "width": req.width, "height": req.height, "batch_size": 1 }
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": { "text": req.prompt, "clip": ["4", 1] }
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": { "text": req.negativePrompt || '', "clip": ["4", 1] }
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": { "samples": ["3", 0], "vae": ["4", 2] }
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": { "filename_prefix": "comfyui", "images": ["8", 0] }
        }
    };
}

/** Poll ComfyUI for job completion. */
async function pollForResult(promptId: string, dest: string, timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${COMFYUI_URL}/history/${promptId}`);
            if (!res.ok) {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            const history = await res.json();
            const outputs = history?.[promptId]?.outputs;
            if (outputs) {
                const saveNode = outputs["9"]; // SaveImage node
                const images = saveNode?.images;
                if (images && images.length > 0) {
                    // Fetch the generated image
                    const imgRes = await fetch(`${COMFYUI_URL}/view?filename=${images[0].filename}&subfolder=${images[0].subfolder || ''}&type=${images[0].type || 'output'}`);
                    if (imgRes.ok) {
                        const buf = Buffer.from(await imgRes.arrayBuffer());
                        fs.writeFileSync(dest, buf);
                        return dest;
                    }
                }
            }
        } catch {
            // Keep polling
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    return '';
}
