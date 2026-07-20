import { BaseProvider } from '../base-provider.js';
import { StoryboardRequest, StoryboardResult, StoryboardScene, ProviderCapabilities } from '../../types.js';
import { isCommandAvailable, generateTempFilePath, writeTextFile } from '../../utils.js';
import { request, RequestOptions } from 'http';

export class OllamaStoryboardProvider extends BaseProvider<StoryboardRequest, StoryboardResult> {
  readonly name = 'ollama-storyboard';
  readonly priority = 10;
  readonly capabilities: ProviderCapabilities = {
    canGenerateVideo: false, canGenerateImage: false, canGenerateAudio: false,
    canGenerateScript: false, canLipSync: false, canEditVideo: false,
    needsGpu: false, needsApiKey: false, needsModelDownload: true,
    maxVideoLengthSeconds: 0, supportedResolutions: [],
  };

  private readonly OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  private readonly MODEL = process.env.OLLAMA_STORYBOARD_MODEL || 'llama3.2:1b';

  protected async doCheckAvailability(): Promise<boolean> {
    if (!isCommandAvailable('ollama')) return false;
    try {
      const data = await this.apiRequest('/api/tags', 'GET');
      return data !== null;
    } catch {
      return false;
    }
  }

  protected async doExecute(request: StoryboardRequest): Promise<StoryboardResult> {
    const scenes: StoryboardScene[] = [];
    for (const scene of request.scenes) {
      const prompt = `Create a detailed image generation prompt for a storyboard scene.

Scene ${scene.sceneNumber}: "${scene.narration}"
Visual direction: ${scene.visualPrompt}
Style: ${request.style || 'cinematic'}
Aspect ratio: ${request.aspectRatio || '16:9'}

Return ONLY a single paragraph prompt. Describe composition, lighting, colors, mood, camera angle. No explanations.`;

      let imagePrompt = prompt;
      try {
        const response = await this.chat([
          { role: 'system', content: 'You are a storyboard artist. Return ONLY the image prompt.' },
          { role: 'user', content: prompt },
        ]);
        if (response.trim()) imagePrompt = response.trim().replace(/^["']|["']$/g, '');
      } catch { /* use default */ }

      const imagePath = generateTempFilePath('jpg', `storyboard_${scene.sceneNumber}`);
      writeTextFile(imagePath, JSON.stringify({
        type: 'storyboard-prompt',
        prompt: imagePrompt,
        sceneNumber: scene.sceneNumber,
        note: 'Placeholder. Replace with AI-generated image (Stable Diffusion/FLUX).',
      }));

      scenes.push({ sceneNumber: scene.sceneNumber, imagePath, narration: scene.narration, visualPrompt: imagePrompt });
    }
    return { scenes, provider: this.name };
  }

  private apiRequest(path: string, method: string, body?: string): Promise<string | null> {
    return new Promise((resolve) => {
      const url = new URL(path, this.OLLAMA_HOST);
      const opts: RequestOptions = {
        method, hostname: url.hostname, port: url.port, path: url.pathname,
        timeout: 10000,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
      };
      const req = request(opts, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      if (body) req.write(body);
      req.end();
    });
  }

  private async chat(messages: Array<{ role: string; content: string }>): Promise<string> {
    const body = JSON.stringify({
      model: this.MODEL, messages, stream: false,
      options: { temperature: 0.7, num_predict: 1024 },
    });
    const response = await this.apiRequest('/api/chat', 'POST', body);
    if (!response) throw new Error('Ollama API request failed');
    try {
      const parsed = JSON.parse(response);
      return parsed.message?.content || parsed.response || '';
    } catch {
      throw new Error('Failed to parse Ollama response');
    }
  }
}
