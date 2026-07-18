/** Platform safe-zone overlays */
import { AgenticPlugin, PluginCategory, Capability } from '../core/types.js';
export const safeZonesPlugin: AgenticPlugin = {
    metadata: {
        name: 'safe-zones',
        version: '1.0.0',
        description: 'Platform-specific safe zone guides (TikTok, Reels, Shorts)',
        tags: ['safe', 'zones', 'platform'],
    },
    category: PluginCategory.OVERLAY,
    capabilities: [Capability.SAFE_ZONES],
    hooks: {},
};
export function registerSafeZones(r: any, c?: any, e = true) {
    r.register(safeZonesPlugin, c, e);
}
