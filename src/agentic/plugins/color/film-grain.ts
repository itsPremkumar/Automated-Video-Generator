/** Procedural film grain overlay */
import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';
export const filmGrainPlugin: AgenticPlugin = {
    metadata: {
        name: 'film-grain',
        version: '1.0.0',
        description: 'Film grain texture overlay',
        tags: ['color', 'grain'],
    },
    category: PluginCategory.COLOR,
    capabilities: [Capability.COLOR_GRADING],
    defaultConfig: { strength: 0.12, size: 1.0 },
    hooks: {
        onRenderFilter: async (scene, ctx) => {
            const c = ctx.getConfig<{ strength: number; size: number }>('film-grain');
            return {
                ...scene,
                filterChain: (scene.filterChain ?? '') + `,noise=alls=${Math.round(c.strength * 100)}:allf=t+u`,
            };
        },
    },
};
export function registerFilmGrain(r: any, c?: any, e = true) {
    r.register(filmGrainPlugin, c, e);
}
