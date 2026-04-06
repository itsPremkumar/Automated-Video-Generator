import { generateScriptFromPrompt } from '../services/ai.service';
import { getDynamicVoices } from '../lib/voice-generator';

export class AiAppService {
    listVoices() {
        return getDynamicVoices();
    }

    generateScript(prompt: string) {
        return generateScriptFromPrompt(prompt);
    }
}

export const aiAppService = new AiAppService();
