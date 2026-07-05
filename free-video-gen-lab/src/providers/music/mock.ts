import { BaseProvider } from '../base-provider.js';
import { MusicGenRequest, MusicGenResult, ProviderCapabilities } from '../../types.js';
import { generateTempFilePath, writeTextFile } from '../../utils.js';

export class MockMusicProvider extends BaseProvider<MusicGenRequest, MusicGenResult> {
  readonly name = 'mock-music';
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

  protected async doExecute(request: MusicGenRequest): Promise<MusicGenResult> {
    const duration = request.duration || 30;
    const outputPath = generateTempFilePath('wav', 'mock_music');
    writeTextFile(outputPath, JSON.stringify({
      type: 'mock-music',
      mood: request.mood,
      genre: request.genre || 'cinematic',
      tempo: request.tempo || 'medium',
      duration,
      note: 'This is a mock music file. Replace with ACE-Step/MusicGen generated audio.',
    }));

    return {
      filePath: outputPath,
      durationSeconds: duration,
      provider: this.name,
    };
  }
}
