/** Cuts synced to music beats */
import { AgenticPlugin, PluginCategory } from '../core/types.js';

export const whipPanPlugin: AgenticPlugin = {
    metadata: {
        name: 'whip-pan',
        version: '1.0.0',
        description: 'Directional blur slide transition',
        tags: ['transition', 'whip'],
    },
    category: PluginCategory.TRANSITION,
    hooks: {
        onPlan: async (plan, ctx) => {
            for (const s of plan.scenes) {
                s.transition = 'whipPan';
                s.transitionParams = { direction: 'left', blur: 50 };
            }
            return plan;
        },
    },
};
export function registerWhipPan(r: any, c?: any, e = true) {
    r.register(whipPanPlugin, c, e);
}
