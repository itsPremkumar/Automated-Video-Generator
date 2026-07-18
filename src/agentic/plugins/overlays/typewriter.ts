/** Typewriter text reveal effect */
import { AgenticPlugin, PluginCategory } from '../core/types.js';
export const typewriterPlugin: AgenticPlugin = {
    metadata: {
        name: 'typewriter',
        version: '1.0.0',
        description: 'Character-by-character typewriter text reveal',
        tags: ['text', 'animation'],
    },
    category: PluginCategory.OVERLAY,
    defaultConfig: { speed: 30, cursor: true },
    hooks: {
        onRenderFilter: async (scene, ctx) => {
            return {
                ...scene,
                filterChain:
                    (scene.filterChain ?? '') +
                    `,drawtext=text='%{pts\\:hms}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=100:box=1:boxcolor=black@0.5`,
            };
        },
    },
};
export function registerTypewriter(r: any, c?: any, e = true) {
    r.register(typewriterPlugin, c, e);
}
