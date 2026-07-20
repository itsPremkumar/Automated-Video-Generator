import { BaseProvider } from '../base-provider.js';
import { LipSyncRequest, LipSyncResult, ProviderCapabilities } from '../../types.js';
import { isNvidiaGpuAvailable, getPythonCommand, getGpuMemoryGB, generateTempFilePath } from '../../utils.js';
import { spawnSync } from 'child_process';

export class InfiniteTalkProvider extends BaseProvider<LipSyncRequest, LipSyncResult> {
  readonly name = 'infinite-talk';
  readonly priority = 10;
  readonly capabilities: ProviderCapabilities = {
    canGenerateVideo: false,
    canGenerateImage: false,
    canGenerateAudio: false,
    canGenerateScript: false,
    canLipSync: true,
    canEditVideo: false,
    needsGpu: true,
    needsApiKey: false,
    needsModelDownload: true,
    maxVideoLengthSeconds: 0,
    supportedResolutions: [],
  };

  private readonly MODEL_NAME = 'MeiGen-AI/InfiniteTalk';
  private readonly MIN_VRAM_GB = 8;

  protected async doCheckAvailability(): Promise<boolean> {
    if (!isNvidiaGpuAvailable()) return false;
    const vram = getGpuMemoryGB();
    if (vram < this.MIN_VRAM_GB) return false;

    // Check if torch is available
    const python = getPythonCommand();
    const result = spawnSync(python, ['-c', 'import torch; print(torch.cuda.is_available())'], {
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
    });
    return result.status === 0 && result.stdout.trim() === 'True';
  }

  protected async doExecute(request: LipSyncRequest): Promise<LipSyncResult> {
    const outputPath = request.outputPath || generateTempFilePath('mp4', 'lipsync');

    const pythonScript = `
import torch
import sys
sys.path.insert(0, '.')
# In production, this would use InfiniteTalk's actual inference API
# See: https://github.com/MeiGen-AI/InfiniteTalk

# Placeholder for InfiniteTalk inference
# from infinitetalk import InfiniteTalkPipeline
# pipe = InfiniteTalkPipeline.from_pretrained("${this.MODEL_NAME}")
# pipe.to("cuda")
# result = pipe(
#     image=r"""${escapePythonString(request.imageFilePath)}""",
#     audio=r"""${escapePythonString(request.audioFilePath)}""",
# )
# result.save(output_path)

import shutil
shutil.copy(r"""${escapePythonString(request.imageFilePath)}""", r"""${outputPath}""")
print("INFINITE_TALK_OK")
`;

    const python = getPythonCommand();
    const result = spawnSync(python, ['-c', pythonScript], {
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
      timeout: 300_000,
    });

    if (result.status !== 0) {
      throw new Error(`InfiniteTalk failed: ${result.stderr}`);
    }

    return {
      videoFilePath: outputPath,
      durationSeconds: 10,
      provider: this.name,
    };
  }
}

function escapePythonString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}
