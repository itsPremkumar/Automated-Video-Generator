import { BaseProvider } from '../base-provider.js';
import { MusicGenRequest, MusicGenResult, ProviderCapabilities } from '../../types.js';
import { isNvidiaGpuAvailable, getPythonCommand, generateTempFilePath } from '../../utils.js';
import { spawnSync } from 'child_process';

export class ACEStepMusicProvider extends BaseProvider<MusicGenRequest, MusicGenResult> {
  readonly name = 'ace-step-music';
  readonly priority = 10;
  readonly capabilities: ProviderCapabilities = {
    canGenerateVideo: false,
    canGenerateImage: false,
    canGenerateAudio: true,
    canGenerateScript: false,
    canLipSync: false,
    canEditVideo: false,
    needsGpu: true,
    needsApiKey: false,
    needsModelDownload: true,
    maxVideoLengthSeconds: 0,
    supportedResolutions: [],
  };

  protected async doCheckAvailability(): Promise<boolean> {
    if (!isNvidiaGpuAvailable()) return false;
    // Check if ace-step package or audiocraft is available
    const python = getPythonCommand();
    const checks = [
      ['import torch; print("ok")'],
      ['from audiocraft.models import MusicGen; print("ok")'],
    ];
    for (const check of checks) {
      const result = spawnSync(python, ['-c', check[0]], {
        stdio: 'pipe', encoding: 'utf-8', shell: false,
      });
      if (result.status !== 0) return false;
    }
    return true;
  }

  protected async doExecute(request: MusicGenRequest): Promise<MusicGenResult> {
    const outputPath = generateTempFilePath('wav', 'ace_step_music');
    const duration = request.duration || 30;

    const pythonScript = `
import torch
from audiocraft.models import MusicGen
from audiocraft.data.audio import audio_write
import soundfile as sf

model = MusicGen.get_pretrained('facebook/musicgen-small')
model.set_generation_params(duration=${duration})

descriptions = ['${request.mood} background music, ${request.genre || 'cinematic'}, ${request.tempo || 'medium'} tempo']
wav = model.generate(descriptions)

for idx, one_wav in enumerate(wav):
    sf.write(r"""${outputPath}""", one_wav.cpu().numpy().T, 32000)
    print(f"DURATION:${duration}")
`;

    const python = getPythonCommand();
    const result = spawnSync(python, ['-c', pythonScript], {
      stdio: 'pipe', encoding: 'utf-8', shell: false,
      timeout: 300_000,
    });

    if (result.status !== 0) {
      throw new Error(`ACE-Step/MusicGen failed: ${result.stderr}`);
    }

    return {
      filePath: outputPath,
      durationSeconds: duration,
      provider: this.name,
    };
  }
}
