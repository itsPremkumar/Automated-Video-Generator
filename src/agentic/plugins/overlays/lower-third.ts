/** Animated lower-third title bar */
import { AgenticPlugin, PluginCategory } from '../core/types.js';
export const lowerThirdPlugin: AgenticPlugin = {
    metadata: {
        name: 'lower-third',
        version: '1.0.0',
        description: 'Animated lower-third title/graphic bar',
        tags: ['text', 'lower-third'],
    },
    category: PluginCategory.OVERLAY,
    defaultConfig: { backgroundColor: 'black@0.7', animation: 'slide-up', text: '' },
    hooks: {
        onRenderFilter: async (scene, ctx) => {
            return {
                ...scene,
                filterChain: (scene.filterChain ?? '') + `,drawbox=x=0:y=h-100:w=iw:h=100:color=black@0.7:t=fill`,
            };
        },
    },
};
export function registerLowerThird(r: any, c?: any, e = true) {
    r.register(lowerThirdPlugin, c, e);
}
