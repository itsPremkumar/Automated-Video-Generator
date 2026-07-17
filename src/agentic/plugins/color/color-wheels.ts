/** Lift/Gamma/Gain color wheels */
import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';
export const colorWheelsPlugin: AgenticPlugin = {
    metadata: { name: 'color-wheels', version: '1.0.0', description: 'Lift/Gamma/Gain color grading controls', tags: ['color', 'wheels'] },
    category: PluginCategory.COLOR,
    capabilities: [Capability.COLOR_GRADING],
    defaultConfig: { lift: { r: 0, g: 0, b: 0 }, gamma: { r: 1, g: 1, b: 1 }, gain: { r: 1, g: 1, b: 1 } },
    hooks: {
        onRenderFilter: async (scene, ctx) => {
            const cfg = ctx.getConfig<{ gamma: { r: number; g: number; b: number }; gain: { r: number; g: number; b: number } }>('color-wheels');
            const g = cfg.gamma ?? { r: 1, g: 1, b: 1 };
            const ga = cfg.gain ?? { r: 1, g: 1, b: 1 };
            return { ...scene, filterChain: (scene.filterChain ?? '') + `,eq=gamma_r=${g.r}:gamma_g=${g.g}:gamma_b=${g.b}:saturation=${(ga.r + ga.g + ga.b) / 3}` };
        },
    },
};
export function registerColorWheels(r: any, c?: any, e = true) { r.register(colorWheelsPlugin, c, e); }
