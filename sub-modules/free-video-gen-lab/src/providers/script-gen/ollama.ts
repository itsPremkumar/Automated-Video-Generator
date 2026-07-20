import { BaseProvider } from '../base-provider.js';
import { ScriptGenRequest, ScriptGenResult, ScriptScene, ProviderCapabilities } from '../../types.js';
import { isCommandAvailable } from '../../utils.js';
import { request, RequestOptions } from 'http';

export class OllamaScriptProvider extends BaseProvider<ScriptGenRequest, ScriptGenResult> {
  readonly name = 'ollama-script';
  readonly priority = 10;
  readonly capabilities: ProviderCapabilities = {
    canGenerateVideo: false, canGenerateImage: false, canGenerateAudio: false,
    canGenerateScript: true, canLipSync: false, canEditVideo: false,
    needsGpu: false, needsApiKey: false, needsModelDownload: true,
    maxVideoLengthSeconds: 0, supportedResolutions: [],
  };

  private readonly OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
  private readonly MODEL = process.env.OLLAMA_SCRIPT_MODEL || 'llama3.2:1b';

  protected async doCheckAvailability(): Promise<boolean> {
    if (!isCommandAvailable('ollama')) return false;
    try {
      const data = await this.apiRequest('/api/tags', 'GET');
      return data !== null;
    } catch {
      return false;
    }
  }

  protected async doExecute(request: ScriptGenRequest): Promise<ScriptGenResult> {
    const messages = [
      { role: 'system', content: 'You are an expert video script writer. Return ONLY valid JSON.' },
      { role: 'user', content: this.buildPrompt(request) },
    ];
    const response = await this.chat(messages);
    return this.parseResponse(response, request);
  }

  private buildPrompt(request: ScriptGenRequest): string {
    return `Create a video script about: "${request.topic}".

Return ONLY valid JSON (no markdown, no code fences):
{
  "title": "string",
  "scenes": [
    {
      "sceneNumber": 1,
      "narration": "text",
      "duration": 7,
      "keywords": ["word1", "word2"],
      "visualPrompt": "detailed image description",
      "cameraAngle": "wide shot",
      "transitions": "fade in"
    }
  ]
}

Rules:
- Split into scenes, each 5-8 seconds
- Total duration: ${request.duration || 30} seconds
- Style: ${request.style || 'cinematic documentary'}
- Language: ${request.language || 'English'}`;
  }

  private apiRequest(path: string, method: string, body?: string): Promise<string | null> {
    return new Promise((resolve) => {
      const url = new URL(path, this.OLLAMA_HOST);
      const opts: RequestOptions = {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
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
      options: { temperature: 0.7, num_predict: 2048 },
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

  private parseResponse(raw: string, request: ScriptGenRequest): ScriptGenResult {
    let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return this.fallbackScript(request);

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || request.topic,
        scenes: parsed.scenes || [],
        fullScript: (parsed.scenes || []).map((s: ScriptScene) =>
          `[Scene ${s.sceneNumber}] ${s.narration}`).join('\n'),
        provider: this.name,
      };
    } catch {
      return this.fallbackScript(request);
    }
  }

  private fallbackScript(request: ScriptGenRequest): ScriptGenResult {
    const total = request.duration || 30;
    const count = Math.max(3, Math.ceil(total / 8));
    const dur = Math.floor(total / count);
    return {
      title: request.topic,
      scenes: Array.from({ length: count }, (_, i) => ({
        sceneNumber: i + 1,
        narration: `Exploring ${request.topic} - part ${i + 1}`,
        duration: dur,
        keywords: [request.topic],
        visualPrompt: `Cinematic shot of ${request.topic}, ${request.style || 'professional'} style`,
        cameraAngle: i === 0 ? 'wide establishing shot' : 'medium shot',
        transitions: i === 0 ? 'fade in' : 'cut',
      })),
      fullScript: '',
      provider: this.name,
    };
  }
}
