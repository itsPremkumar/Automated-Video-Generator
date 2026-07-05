import { BaseProvider } from '../base-provider.js';
import { VideoGenRequest, VideoGenResult, ProviderCapabilities } from '../../types.js';
import { isNvidiaGpuAvailable, getGpuMemoryGB, isPythonModuleAvailable, getPythonCommand, generateTempFilePath } from '../../utils.js';
import { spawnSync } from 'child_process';

export class CogVideoXProvider extends BaseProvider<VideoGenRequest, VideoGenResult> {
  readonly name = 'cogvideox';
  readonly priority = 20; // Second priority after LTX-Video
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
    maxVideoLengthSeconds: 6,
    supportedResolutions: ['720x480', '1360x768'],
  };

  private readonly MODEL_NAME = 'THUDM/CogVideoX-2B';
  private readonly MIN_VRAM_GB = 10;

  protected async doCheckAvailability(): Promise<boolean> {
    if (!isNvidiaGpuAvailable()) return false;
    const vram = getGpuMemoryGB();
    if (vram < this.MIN_VRAM_GB) return false;

    if (!isPythonModuleAvailable('diffusers')) return false;
    if (!isPythonModuleAvailable('torch')) return false;

    return true; // Model will be downloaded on first use
  }

  protected async doExecute(request: VideoGenRequest): Promise<VideoGenResult> {
    const outputPath = generateTempFilePath('mp4', 'cogvideo');
    const width = request.resolution?.width || 720;
    const height = request.resolution?.height || 480;
    const fps = request.fps || 8;
    const numFrames = request.numFrames || 49;

    const pythonScript = `
import torch
from diffusers import CogVideoXPipeline
from diffusers.utils import export_to_video
import sys

pipe = CogVideoXPipeline.from_pretrained(
    "${this.MODEL_NAME}",
    torch_dtype=torch.float16
)
pipe.to("cuda")
pipe.enable_model_cpu_offload()
pipe.enable_attention_slicing()

prompt = """${escapePythonString(request.prompt)}"""
negative = """${escapePythonString(request.negativePrompt || 'blurry, low quality')}"""

video = pipe(
    prompt=prompt,
    negative_prompt=negative,
    num_videos_per_prompt=1,
    num_inference_steps=50,
    num_frames=${numFrames},
    guidance_scale=7.0,
    width=${width},
    height=${height},
).frames[0]

export_to_video(video, r"""${outputPath}""", fps=${fps})
print(f"DURATION:{${numFrames}/${fps}}")
`;

    const python = getPythonCommand();
    const result = spawnSync(python, ['-c', pythonScript], {
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
      timeout: 300_000,
    });

    if (result.status !== 0) {
      throw new Error(`CogVideoX inference failed: ${result.stderr}`);
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
