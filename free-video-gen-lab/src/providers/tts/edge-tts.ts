import { BaseProvider } from '../base-provider.js';
import { TTSRequest, TTSResult, ProviderCapabilities } from '../../types.js';
import { isPythonModuleAvailable, getPythonCommand, generateTempFilePath } from '../../utils.js';
import { spawnSync } from 'child_process';
import * as fs from 'fs';

export class EdgeTTSProvider extends BaseProvider<TTSRequest, TTSResult> {
  readonly name = 'edge-tts';
  readonly priority = 10;
  readonly capabilities: ProviderCapabilities = {
    canGenerateVideo: false,
    canGenerateImage: false,
    canGenerateAudio: true,
    canGenerateScript: false,
    canLipSync: false,
    canEditVideo: false,
    needsGpu: false,
    needsApiKey: false,
    needsModelDownload: false,
    maxVideoLengthSeconds: 0,
    supportedResolutions: [],
  };

  private readonly DEFAULT_VOICE = 'en-US-JennyNeural';

  protected async doCheckAvailability(): Promise<boolean> {
    return isPythonModuleAvailable('edge_tts');
  }

  protected async doExecute(request: TTSRequest): Promise<TTSResult> {
    const voice = request.voice || this.DEFAULT_VOICE;
    const outputPath = generateTempFilePath('mp3', 'tts');

    const python = getPythonCommand();
    const result = spawnSync(python, [
      '-m', 'edge_tts',
      '--voice', voice,
      '--text', request.text,
      '--write-media', outputPath,
    ], {
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
      timeout: 60_000,
    });

    if (result.status !== 0) {
      throw new Error(`Edge-TTS failed: ${result.stderr}`);
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error('Edge-TTS produced no output file');
    }

    return {
      filePath: outputPath,
      durationSeconds: this.estimateDuration(request.text),
      provider: this.name,
      voice,
    };
  }

  private estimateDuration(text: string): number {
    const wordsPerMinute = 150;
    const wordCount = text.split(/\s+/).length;
    return Math.max(1, Math.ceil(wordCount / wordsPerMinute * 60));
  }
}
