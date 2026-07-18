/** Optical flow morph cut transition */
import { AgenticPlugin, PluginCategory } from '../core/types.js';
export const morphCutPlugin: AgenticPlugin = {
    metadata: {
        name: 'morph-cut',
        version: '1.0.0',
        description: 'Optical flow morph cut transition (minterpolate)',
        tags: ['transition', 'morph'],
    },
    category: PluginCategory.TRANSITION,
    hooks: {
        onPlan: async (plan, ctx) => {
            for (const s of plan.scenes) {
                s.transition = 'morphCut';
                s.transitionDuration = 0.5;
            }
            return plan;
        },
    },
};
export function registerMorphCut(r: any, c?: any, e = true) {
    r.register(morphCutPlugin, c, e);
}
