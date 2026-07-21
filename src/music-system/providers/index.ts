/**
 * src/music-system/providers/index.ts
 * Registers all default providers into the global registry.
 */

import { globalRegistry } from './registry';
import { BundledProvider } from './bundled';
import { LocalProvider } from './local';
import { PixabayProvider } from './pixabay';
import { OpenLofiProvider } from './open-lofi';
import { InternetArchiveProvider } from './internet-archive';
import { ProceduralProvider } from './procedural';

/** Register all built-in providers in priority order */
export function registerDefaultProviders(): void {
    // Tier 1 — Offline (always available)
    globalRegistry.register(new BundledProvider());       // priority 1
    globalRegistry.register(new LocalProvider());          // priority 2

    // Tier 2–3 — Network (real music)
    globalRegistry.register(new PixabayProvider());        // priority 3
    globalRegistry.register(new OpenLofiProvider());       // priority 5

    // Tier 4 — Network fallback
    globalRegistry.register(new InternetArchiveProvider());// priority 6

    // Tier 5 — Procedural (never fails)
    globalRegistry.register(new ProceduralProvider());     // priority 99
}

export { globalRegistry } from './registry';
export { BundledProvider } from './bundled';
export { LocalProvider } from './local';
export { PixabayProvider } from './pixabay';
export { OpenLofiProvider } from './open-lofi';
export { InternetArchiveProvider } from './internet-archive';
export { ProceduralProvider } from './procedural';
export { BaseMusicProvider, probeDuration, runFfmpeg, withSignal } from './base';
