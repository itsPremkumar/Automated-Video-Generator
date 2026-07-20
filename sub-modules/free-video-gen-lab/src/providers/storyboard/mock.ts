import { BaseProvider } from '../base-provider.js';
import { StoryboardRequest, StoryboardResult, StoryboardScene, ProviderCapabilities } from '../../types.js';
import { generateTempFilePath, writeTextFile } from '../../utils.js';

export class MockStoryboardProvider extends BaseProvider<StoryboardRequest, StoryboardResult> {
  readonly name = 'mock-storyboard';
  readonly priority = 99;
  readonly capabilities: ProviderCapabilities = {
    canGenerateVideo: false,
    canGenerateImage: false,
    canGenerateAudio: false,
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

  protected async doExecute(request: StoryboardRequest): Promise<StoryboardResult> {
    const scenes: StoryboardScene[] = request.scenes.map(scene => {
      const imagePath = generateTempFilePath('jpg', `storyboard_mock_${scene.sceneNumber}`);
      writeTextFile(imagePath, JSON.stringify({
        type: 'mock-storyboard-image',
        sceneNumber: scene.sceneNumber,
        narration: scene.narration,
        prompt: scene.visualPrompt,
        note: 'This is a mock storyboard image. Replace with actual AI-generated image.',
      }));
      return {
        sceneNumber: scene.sceneNumber,
        imagePath,
        narration: scene.narration,
        visualPrompt: scene.visualPrompt,
      };
    });

    return { scenes, provider: this.name };
  }
}
