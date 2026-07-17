/** Digital glitch/RGB-split transition */
import { AgenticPlugin, PluginCategory } from '../core/types.js';
export const glitchPlugin: AgenticPlugin = {
    metadata: { name: 'glitch', version: '1.0.0', description: 'Digital glitch transition with RGB shift', tags: ['transition', 'glitch'] },
    category: PluginCategory.TRANSITION,
    hooks: {
        onPlan: async (plan, ctx) => {
            for (const s of plan.scenes) { s.transition = 'glitch'; s.transitionParams = { intensity: 1.0 }; }
            return plan;
        },
    },
};
export function registerGlitch(r: any, c?: any, e = true) { r.register(glitchPlugin, c, e); }
