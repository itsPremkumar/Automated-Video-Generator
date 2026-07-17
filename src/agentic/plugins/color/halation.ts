/** Highlight halation/bloom effect */
import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';
export const halationPlugin: AgenticPlugin = {
    metadata: { name: 'halation', version: '1.0.0', description: 'Highlight bloom/halation effect', tags: ['color', 'bloom'] },
    category: PluginCategory.COLOR,
    capabilities: [Capability.COLOR_GRADING],
    defaultConfig: { threshold: 0.9, intensity: 0.3 },
    hooks: {
        onRenderFilter: async (scene, ctx) => {
            return { ...scene, filterChain: (scene.filterChain ?? '') + ',split[orig][halo];[halo]gblur=sigma=5:steps=3[blur];[orig][blur]blend=all_mode=screen:all_opacity=0.3' };
        },
    },
};
export function registerHalation(r: any, c?: any, e = true) { r.register(halationPlugin, c, e); }
