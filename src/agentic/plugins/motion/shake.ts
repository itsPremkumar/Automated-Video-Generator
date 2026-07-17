/** Handheld camera shake effect */
import { AgenticPlugin, PluginCategory } from '../core/types.js';
export const shakePlugin: AgenticPlugin = {
    metadata: { name: 'shake', version: '1.0.0', description: 'Handheld camera shake simulation', tags: ['motion', 'shake'] },
    category: PluginCategory.MOTION,
    defaultConfig: { intensity: 0.02, frequency: 15 },
    hooks: {
        onRenderFilter: async (scene, ctx) => {
            const cfg = ctx.getConfig<{ intensity: number; frequency: number }>('shake');
            return { ...scene, filterChain: (scene.filterChain ?? '') + `,crop=iw-${cfg.intensity * 100}:ih-${cfg.intensity * 100}:(random(1)*${cfg.frequency})%${cfg.intensity * 50}:(random(2)*${cfg.frequency})%${cfg.intensity * 50}` };
        },
    },
};
export function registerShake(r: any, c?: any, e = true) { r.register(shakePlugin, c, e); }
