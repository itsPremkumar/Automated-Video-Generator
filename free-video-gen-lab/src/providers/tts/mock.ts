import { BaseProvider } from '../base-provider.js';
import { TTSRequest, TTSResult, ProviderCapabilities } from '../../types.js';
import { generateTempFilePath, writeTextFile } from '../../utils.js';

export class MockTTSProvider extends BaseProvider<TTSRequest, TTSResult> {
  readonly name = 'mock-tts';
  readonly priority = 99;
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

  protected async doCheckAvailability(): Promise<boolean> {
    return true;
  }

  protected async doExecute(request: TTSRequest): Promise<TTSResult> {
    const outputPath = generateTempFilePath('mp3', 'mock_tts');
    writeTextFile(outputPath, JSON.stringify({
      type: 'mock-tts',
      text: request.text,
      voice: request.voice || 'default',
      note: 'This is a mock TTS file. Replace with Edge-TTS/gTTS output.',
    }));

    return {
      filePath: outputPath,
      durationSeconds: this.estimateDuration(request.text),
      provider: this.name,
      voice: request.voice || 'mock-voice',
    };
  }

  private estimateDuration(text: string): number {
    const wpm = 150;
    return Math.max(1, Math.ceil(text.split(/\s+/).length / wpm * 60));
  }
}
