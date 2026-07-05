import { BaseProvider } from '../base-provider.js';
import { ScriptGenRequest, ScriptGenResult, ScriptScene, ProviderCapabilities } from '../../types.js';

export class MockScriptProvider extends BaseProvider<ScriptGenRequest, ScriptGenResult> {
  readonly name = 'mock-script';
  readonly priority = 99;
  readonly capabilities: ProviderCapabilities = {
    canGenerateVideo: false,
    canGenerateImage: false,
    canGenerateAudio: false,
    canGenerateScript: true,
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

  protected async doExecute(request: ScriptGenRequest): Promise<ScriptGenResult> {
    const totalDuration = request.duration || 30;
    const sceneDuration = 7;
    const sceneCount = Math.ceil(totalDuration / sceneDuration);

    const scenes: ScriptScene[] = Array.from({ length: sceneCount }, (_, i) => ({
      sceneNumber: i + 1,
      narration: this.generateNarration(i, request.topic),
      duration: sceneDuration,
      keywords: this.generateKeywords(i, request.topic),
      visualPrompt: this.generateVisualPrompt(i, request.topic, request.style),
      cameraAngle: this.getCameraAngle(i, sceneCount),
      transitions: i === 0 ? 'fade in' : i === sceneCount - 1 ? 'fade out' : 'cross dissolve',
    }));

    return {
      title: `About ${request.topic}`,
      scenes,
      fullScript: scenes.map(s => `[Scene ${s.sceneNumber}] ${s.narration}`).join('\n\n'),
      provider: this.name,
    };
  }

  private generateNarration(index: number, topic: string): string {
    const narrations = [
      `Let's explore the fascinating world of ${topic}.`,
      `${topic} has a rich history that spans decades.`,
      `The key aspects of ${topic} include several important factors.`,
      `Many experts consider ${topic} to be revolutionary.`,
      `Looking ahead, ${topic} will continue to evolve.`,
    ];
    return narrations[index % narrations.length];
  }

  private generateKeywords(index: number, topic: string): string[] {
    const keywords = [
      [topic, 'overview', 'introduction'],
      [topic, 'history', 'background'],
      [topic, 'features', 'highlights'],
      [topic, 'expert', 'analysis'],
      [topic, 'future', 'innovation'],
    ];
    return keywords[index % keywords.length];
  }

  private generateVisualPrompt(index: number, topic: string, style?: string): string {
    const shots = [
      `Cinematic wide establishing shot of ${topic}, ${style || 'professional'} lighting, high detail`,
      `Medium shot showcasing ${topic} details, dramatic lighting, 4k quality`,
      `Close-up detailed view of ${topic}, shallow depth of field, cinematic`,
      `Drone aerial perspective of ${topic}, golden hour lighting, majestic`,
      `Creative artistic interpretation of ${topic}, dynamic composition, vibrant colors`,
    ];
    return shots[index % shots.length];
  }

  private getCameraAngle(index: number, total: number): string {
    if (index === 0) return 'wide establishing shot';
    if (index === total - 1) return 'bird\'s eye view';
    if (index % 2 === 0) return 'medium shot';
    return 'close-up';
  }
}
