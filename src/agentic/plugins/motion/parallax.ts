/** 2.5D parallax layer effect */
import { AgenticPlugin, PluginCategory } from '../core/types.js';
export const parallaxPlugin: AgenticPlugin = {
    metadata: {
        name: 'parallax',
        version: '1.0.0',
        description: '2.5D parallax depth simulation (requires foreground/background split)',
        tags: ['motion', 'parallax'],
    },
    category: PluginCategory.MOTION,
    defaultConfig: {
        layers: [
            { depth: 1, scale: 1.2 },
            { depth: 2, scale: 1.05 },
        ],
    },
    hooks: {
        onRenderFilter: async (scene, ctx) => {
            return { ...scene, filterChain: (scene.filterChain ?? '') + `,zoompan=z='1+0.001*sin(2*PI*t/5)':d=1` };
        },
    },
};
export function registerParallax(r: any, c?: any, e = true) {
    r.register(parallaxPlugin, c, e);
}
