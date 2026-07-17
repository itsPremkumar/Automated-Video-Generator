/** Advanced Ken Burns zoom with auto-direction */
import { AgenticPlugin, PluginCategory } from '../core/types.js';
export const kenBurnsProPlugin: AgenticPlugin = {
    metadata: { name: 'ken-burns-pro', version: '1.0.0', description: 'Advanced Ken Burns zoom with auto direction', tags: ['motion', 'zoom'] },
    category: PluginCategory.MOTION,
    hooks: {
        onRenderFilter: async (scene, ctx) => {
            if (scene.kind !== 'image') return scene;
            const i = Math.round(Math.random() * 2) + 1; // 1-3
            const dir = ['1.015', '1+0.001*cos(2*PI*t)', '1+0.0008*sin(PI*t/4)'][i - 1];
            const zoom = `zoompan=z='${dir}':d=1:s=${scene.filterChain?.match(/x(\d+)/)?.[1] ?? 1280}x${scene.filterChain?.match(/(\d+)$/)?.[1] ?? 720}`;
            return { ...scene, filterChain: (scene.filterChain ?? '') + ',' + zoom };
        },
    },
};
export function registerKenBurnsPro(r: any, c?: any, e = true) { r.register(kenBurnsProPlugin, c, e); }
