/** Timeline progress bar overlay */
import { AgenticPlugin, PluginCategory } from '../core/types.js';
export const progressBarPlugin: AgenticPlugin = {
    metadata: {
        name: 'progress-bar',
        version: '1.0.0',
        description: 'Animated progress bar showing video position',
        tags: ['overlay', 'progress'],
    },
    category: PluginCategory.OVERLAY,
    defaultConfig: { color: '#FF0050', height: 4, position: 'bottom' },
    hooks: {
        onRenderFilter: async (scene, ctx) => {
            const c = ctx.getConfig<{ color: string; height: number }>('progress-bar');
            return {
                ...scene,
                filterChain:
                    (scene.filterChain ?? '') +
                    `,drawbox=x=0:y=ih-${c.height}:w=iw*min(1,t/${scene.durationSec || 4}):h=${c.height}:color=${c.color ?? '#FF0050'}:t=fill`,
            };
        },
    },
};
export function registerProgressBar(r: any, c?: any, e = true) {
    r.register(progressBarPlugin, c, e);
}
