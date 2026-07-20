import { BaseProvider } from '../base-provider.js';
import { VideoGenRequest, VideoGenResult, ProviderCapabilities } from '../../types.js';
import { generateTempFilePath, writeTextFile } from '../../utils.js';

export class MockVideoProvider extends BaseProvider<VideoGenRequest, VideoGenResult> {
  readonly name = 'mock-video';
  readonly priority = 99; // Lowest priority - last resort
  readonly capabilities: ProviderCapabilities = {
    canGenerateVideo: true,
    canGenerateImage: false,
    canGenerateAudio: false,
    canGenerateScript: false,
    canLipSync: false,
    canEditVideo: false,
    needsGpu: false,
    needsApiKey: false,
    needsModelDownload: false,
    maxVideoLengthSeconds: 30,
    supportedResolutions: ['1920x1080', '1080x1920'],
  };

  protected async doCheckAvailability(): Promise<boolean> {
    return true; // Mock is always available
  }

  protected async doExecute(request: VideoGenRequest): Promise<VideoGenResult> {
    const ext = 'mp4';
    const outputPath = generateTempFilePath(ext, 'mock_video');
    const width = request.resolution?.width || 1080;
    const height = request.resolution?.height || 1920;
    const fps = request.fps || 30;
    const duration = request.duration || 5;

    // Create a mock video file (text file with metadata, since we can't generate actual video)
    writeTextFile(outputPath, JSON.stringify({
      type: 'mock-video',
      prompt: request.prompt,
      duration,
      width,
      height,
      fps,
      note: 'This is a mock video file. Replace with actual AI-generated video.',
    }));

    return {
      filePath: outputPath,
      durationSeconds: duration,
      width,
      height,
      fps,
      provider: this.name,
    };
  }
}
