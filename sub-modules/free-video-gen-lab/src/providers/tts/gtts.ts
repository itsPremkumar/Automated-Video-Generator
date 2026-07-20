import { BaseProvider } from '../base-provider.js';
import { TTSRequest, TTSResult, ProviderCapabilities } from '../../types.js';
import { isPythonModuleAvailable, getPythonCommand, generateTempFilePath } from '../../utils.js';
import { spawnSync } from 'child_process';
import * as fs from 'fs';

export class GTTSProvider extends BaseProvider<TTSRequest, TTSResult> {
  readonly name = 'gtts';
  readonly priority = 20; // Lower priority than edge-tts
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
    return isPythonModuleAvailable('gtts');
  }

  protected async doExecute(request: TTSRequest): Promise<TTSResult> {
    const outputPath = generateTempFilePath('mp3', 'gtts');
    const lang = request.language || 'en';
    const tld = 'com';

    const python = getPythonCommand();
    const pythonScript = `
from gtts import gTTS
import sys
tts = gTTS(text="""${this.escapePythonString(request.text)}""", lang="${lang}", tld="${tld}")
tts.save(r"""${outputPath}""")
print("GTTS_OK")
`;

    const result = spawnSync(python, ['-c', pythonScript], {
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
      timeout: 60_000,
    });

    if (result.status !== 0) {
      throw new Error(`gTTS failed: ${result.stderr}`);
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error('gTTS produced no output file');
    }

    return {
      filePath: outputPath,
      durationSeconds: this.estimateDuration(request.text),
      provider: this.name,
      voice: `gtts-${lang}`,
    };
  }

  private escapePythonString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }

  private estimateDuration(text: string): number {
    const wordsPerMinute = 150;
    const wordCount = text.split(/\s+/).length;
    return Math.max(1, Math.ceil(wordCount / wordsPerMinute * 60));
  }
}
