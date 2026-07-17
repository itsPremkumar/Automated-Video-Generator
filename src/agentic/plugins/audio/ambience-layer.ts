/** Background ambience/atmosphere audio layer */
import { AgenticPlugin, PluginCategory } from '../core/types.js';
export const ambienceLayerPlugin: AgenticPlugin = {
    metadata: { name: 'ambience-layer', version: '1.0.0', description: 'Background ambience/atmosphere track for depth', tags: ['audio', 'ambience'] },
    category: PluginCategory.AUDIO,
    defaultConfig: { volume: -24, track: '' },
    hooks: {},
};
export function registerAmbienceLayer(r: any, c?: any, e = true) { r.register(ambienceLayerPlugin, c, e); }
