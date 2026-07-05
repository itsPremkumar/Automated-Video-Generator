import { BaseProvider } from '../base-provider.js';
import { VideoGenRequest, VideoGenResult, ProviderCapabilities } from '../../types.js';
import { isNvidiaGpuAvailable, getGpuMemoryGB, isPythonModuleAvailable, getPythonCommand, generateTempFilePath } from '../../utils.js';
import { spawnSync } from 'child_process';

export class WanVideoProvider extends BaseProvider<VideoGenRequest, VideoGenResult> {
  readonly name = 'wan-video';
  readonly priority = 15; // Between LTX and CogVideoX
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
    supportedResolutions: ['480x480', '720x720'],
  };

  private readonly MODEL_NAME = 'Wan-AI/Wan2.1-T2V-1.3B';
  private readonly MIN_VRAM_GB = 6;

  protected async doCheckAvailability(): Promise<boolean> {
    if (!isNvidiaGpuAvailable()) return false;
    const vram = getGpuMemoryGB();
    if (vram < this.MIN_VRAM_GB) return false;

    if (!isPythonModuleAvailable('diffusers')) return false;
    if (!isPythonModuleAvailable('torch')) return false;

    return true;
  }

  protected async doExecute(request: VideoGenRequest): Promise<VideoGenResult> {
    const outputPath = generateTempFilePath('mp4', 'wan_video');
    const width = request.resolution?.width || 480;
    const height = request.resolution?.height || 480;
    const fps = request.fps || 16;

    const pythonScript = `
import torch
from diffusers import WanPipeline
from diffusers.utils import export_to_video
import sys

pipe = WanPipeline.from_pretrained(
    "${this.MODEL_NAME}",
    torch_dtype=torch.float16
)
pipe.to("cuda")
pipe.enable_model_cpu_offload()

prompt = """${escapePythonString(request.prompt)}"""
negative = """${escapePythonString(request.negativePrompt || 'blurry, low quality')}"""

video = pipe(
    prompt=prompt,
    negative_prompt=negative,
    num_frames=${Math.max(1, Math.floor((request.duration || 5) * fps))},
    width=${width},
    height=${height},
    num_inference_steps=50,
    guidance_scale=5.0,
).frames[0]

export_to_video(video, r"""${outputPath}""", fps=${fps})
print(f"DURATION:{${request.duration || 5}}")
`;

    const python = getPythonCommand();
    const result = spawnSync(python, ['-c', pythonScript], {
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
      timeout: 300_000,
    });

    if (result.status !== 0) {
      throw new Error(`Wan2.1 inference failed: ${result.stderr}`);
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
