import { BaseProvider } from '../base-provider.js';
import { LipSyncRequest, LipSyncResult, ProviderCapabilities } from '../../types.js';
import { generateTempFilePath, writeTextFile } from '../../utils.js';

export class MockLipSyncProvider extends BaseProvider<LipSyncRequest, LipSyncResult> {
  readonly name = 'mock-lipsync';
  readonly priority = 99;
  readonly capabilities: ProviderCapabilities = {
    canGenerateVideo: false,
    canGenerateImage: false,
    canGenerateAudio: false,
    canGenerateScript: false,
    canLipSync: true,
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

  protected async doExecute(request: LipSyncRequest): Promise<LipSyncResult> {
    const outputPath = request.outputPath || generateTempFilePath('mp4', 'mock_lipsync');
    writeTextFile(outputPath, JSON.stringify({
      type: 'mock-lipsync',
      inputImage: request.imageFilePath,
      inputAudio: request.audioFilePath,
      note: 'This is a mock lip-sync video. Replace with InfiniteTalk/MOVA.',
    }));

    return {
      videoFilePath: outputPath,
      durationSeconds: 5,
      provider: this.name,
    };
  }
}
