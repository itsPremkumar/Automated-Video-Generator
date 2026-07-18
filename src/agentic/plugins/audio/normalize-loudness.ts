/** LUFS loudness normalization */
import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';
export const normalizeLoudnessPlugin: AgenticPlugin = {
    metadata: {
        name: 'normalize-loudness',
        version: '1.0.0',
        description: 'LUFS loudness normalization to platform standards',
        tags: ['audio', 'loudness'],
    },
    category: PluginCategory.AUDIO,
    capabilities: [Capability.AUDIO_ANALYSIS],
    defaultConfig: { targetLUFS: -14, truePeak: -1.5 },
    hooks: {},
};
export function registerNormalizeLoudness(r: any, c?: any, e = true) {
    r.register(normalizeLoudnessPlugin, c, e);
}
