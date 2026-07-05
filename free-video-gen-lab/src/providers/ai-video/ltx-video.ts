import { BaseProvider } from '../base-provider.js';
import { VideoGenRequest, VideoGenResult, ProviderCapabilities } from '../../types.js';
import { isNvidiaGpuAvailable, getGpuMemoryGB, getPythonCommand, isPythonModuleAvailable, generateTempFilePath } from '../../utils.js';
import { spawnSync } from 'child_process';
import * as fs from 'fs';

export class LTXVideoProvider extends BaseProvider<VideoGenRequest, VideoGenResult> {
  readonly name = 'ltx-video';
  readonly priority = 10; // High priority - best quality free model
  readonly capabilities: ProviderCapabilities = {
    canGenerateVideo: true,
    canGenerateImage: false,
    canGenerateAudio: false,
    canGenerateScript: false,
    canLipSync: false,
    canEditVideo: false,
    needsGpu: true,
    needsApiKey: false,
    needsModelDownload: true,
    maxVideoLengthSeconds: 10,
    supportedResolutions: ['512x512', '768x768', '1024x1024'],
  };

  private readonly MODEL_NAME = 'Lightricks/LTX-Video';
  private readonly MIN_VRAM_GB = 8;

  protected async doCheckAvailability(): Promise<boolean> {
    // Check: GPU with enough VRAM + diffusers installed + model downloaded
    if (!isNvidiaGpuAvailable()) return false;
    const vram = getGpuMemoryGB();
    if (vram < this.MIN_VRAM_GB) return false;

    if (!isPythonModuleAvailable('diffusers')) return false;
    if (!isPythonModuleAvailable('torch')) return false;

    // Check if model is cached locally
    const python = getPythonCommand();
    const checkScript = `
from huggingface_hub import try_to_load_from_cache
import sys
cached = try_to_load_from_cache("${this.MODEL_NAME}", "model_index.json")
sys.exit(0 if cached is not None else 1)
`;
    const result = spawnSync(python, ['-c', checkScript], {
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
    });
    return result.status === 0;
  }

  protected async doExecute(request: VideoGenRequest): Promise<VideoGenResult> {
    const outputPath = generateTempFilePath('mp4', 'ltx_video');
    const width = request.resolution?.width || 768;
    const height = request.resolution?.height || 768;
    const fps = request.fps || 24;
    const numFrames = request.numFrames || Math.max(1, Math.floor((request.duration || 5) * fps));

    // Build and run the Python inference script
    const pythonScript = `
import torch
from diffusers import LTXPipeline
from diffusers.utils import export_to_video
import sys

pipe = LTXPipeline.from_pretrained("${this.MODEL_NAME}", torch_dtype=torch.bfloat16)
pipe.to("cuda")

# Enable memory optimization
pipe.enable_model_cpu_offload()
pipe.enable_attention_slicing()

prompt = """${escapePythonString(request.prompt)}"""
negative_prompt = """${escapePythonString(request.negativePrompt || 'blurry, low quality, distorted')}"""

video_frames = pipe(
    prompt=prompt,
    negative_prompt=negative_prompt,
    width=${width},
    height=${height},
    num_frames=${numFrames},
    num_inference_steps=50,
    guidance_scale=7.5,
).frames[0]

export_to_video(video_frames, r"""${outputPath}""", fps=${fps})
print(f"DURATION:{${numFrames}/${fps}}")
print(f"FPS:{${fps}}")
print(f"WIDTH:{${width}}")
print(f"HEIGHT:{${height}}")
`;

    const python = getPythonCommand();
    const result = spawnSync(python, ['-c', pythonScript], {
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
      timeout: 300_000, // 5 min timeout
    });

    if (result.status !== 0) {
      throw new Error(`LTX-Video inference failed: ${result.stderr}`);
    }

    return {
      filePath: outputPath,
      durationSeconds: request.duration || 5,
      width,
      height,
      fps,
      provider: this.name,
    };
  }
}

function escapePythonString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
