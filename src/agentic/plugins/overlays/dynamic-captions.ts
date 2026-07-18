/** Animated captions (word-pop, bounce, fade) */
import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';
export const dynamicCaptionsPlugin: AgenticPlugin = {
    metadata: {
        name: 'dynamic-captions',
        version: '1.0.0',
        description: 'Animated caption styles (bounce, pop, fade)',
        tags: ['captions', 'text'],
    },
    category: PluginCategory.OVERLAY,
    capabilities: [Capability.OVERLAY_ANIMATED],
    defaultConfig: { style: 'pop', highlightColor: 'yellow', boxColor: 'black@0.6', fontSize: 42 },
    hooks: {
        onRenderFilter: async (scene, ctx) => {
            const cfg = ctx.getConfig<{ fontSize: number }>('dynamic-captions');
            return {
                ...scene,
                filterChain:
                    (scene.filterChain ?? '') +
                    `,drawtext=fontsize=${cfg.fontSize ?? 42}:fontcolor=white:box=1:boxcolor=black@0.5:x=(w-text_w)/2:y=h-text_h-120`,
            };
        },
    },
};
export function registerDynamicCaptions(r: any, c?: any, e = true) {
    r.register(dynamicCaptionsPlugin, c, e);
}
