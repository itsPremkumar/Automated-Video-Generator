/** Light leak overlay transition */
import { AgenticPlugin, PluginCategory } from '../core/types.js';
export const lightLeakPlugin: AgenticPlugin = {
    metadata: {
        name: 'light-leak',
        version: '1.0.0',
        description: 'Light leak overlay transition',
        tags: ['transition', 'leak'],
    },
    category: PluginCategory.TRANSITION,
    hooks: {
        onPlan: async (plan, ctx) => {
            for (const s of plan.scenes) {
                s.transition = 'lightLeak';
                s.transitionParams = { mode: 'screen', opacity: 0.6 };
            }
            return plan;
        },
    },
};
export function registerLightLeak(r: any, c?: any, e = true) {
    r.register(lightLeakPlugin, c, e);
}
