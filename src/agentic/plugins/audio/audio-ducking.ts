/** Sidechain audio ducking - music ducks under voiceover */
import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';
export const audioDuckingPlugin: AgenticPlugin = {
    metadata: { name: 'audio-ducking', version: '1.0.0', description: 'Sidechain compression: duck music under voiceover', tags: ['audio', 'ducking'] },
    category: PluginCategory.AUDIO,
    capabilities: [Capability.AUDIO_ANALYSIS],
    defaultConfig: { duckLevel: -18, attack: 0.1, release: 0.3, threshold: -20 },
    hooks: {
        onPlan: async (plan, ctx) => {
            plan.metadata = { ...plan.metadata, ducking: ctx.getConfig('audio-ducking') };
            return plan;
        },
    },
};
export function registerAudioDucking(r: any, c?: any, e = true) { r.register(audioDuckingPlugin, c, e); }
