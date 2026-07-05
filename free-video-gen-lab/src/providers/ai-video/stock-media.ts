import { BaseProvider } from '../base-provider.js';
import { VideoGenRequest, VideoGenResult, ProviderCapabilities } from '../../types.js';
import { generateTempFilePath, writeTextFile } from '../../utils.js';

/**
 * Stock media fallback provider.
 * This mirrors AVG's existing approach: use stock media URLs instead of AI-generated video.
 * In production, this would call Pexels/Pixabay/Openverse/Wikimedia APIs.
 */
export class StockMediaFallbackProvider extends BaseProvider<VideoGenRequest, VideoGenResult> {
  readonly name = 'stock-media-fallback';
  readonly priority = 50;
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

  private readonly FREE_SOURCES = [
    { name: 'Openverse', url: 'https://wordpress.org/openverse/' },
    { name: 'Wikimedia Commons', url: 'https://commons.wikimedia.org/' },
    { name: 'Internet Archive', url: 'https://archive.org/' },
    { name: 'Pexels (free key)', url: 'https://www.pexels.com/api/' },
    { name: 'Pixabay (free key)', url: 'https://pixabay.com/api/' },
  ];

  protected async doCheckAvailability(): Promise<boolean> {
    return true; // Stock media sources are always available as fallback
  }

  protected async doExecute(request: VideoGenRequest): Promise<VideoGenResult> {
    const ext = 'mp4';
    const outputPath = generateTempFilePath(ext, 'stock_media');
    const width = request.resolution?.width || 1080;
    const height = request.resolution?.height || 1920;

    writeTextFile(outputPath, JSON.stringify({
      type: 'stock-media-fallback',
      prompt: request.prompt,
      note: 'This is a stock media placeholder. In production, this downloads from free stock sources.',
      availableSources: this.FREE_SOURCES.map(s => s.name),
      resolution: `${width}x${height}`,
    }));

    return {
      filePath: outputPath,
      durationSeconds: request.duration || 5,
      width,
      height,
      fps: 30,
      provider: this.name,
    };
  }
}
