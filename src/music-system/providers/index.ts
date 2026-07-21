/**
 * src/music-system/providers/index.ts
 * Registers all default providers into the global registry.
 */

import { globalRegistry } from './registry';
import { BundledProvider } from './bundled';
import { LocalProvider } from './local';
import { CcMixterProvider } from './ccmixter';
import { InternetArchiveProvider } from './internet-archive';
import { ProceduralProvider } from './procedural';

/** Register all built-in providers in priority order */
export function registerDefaultProviders(): void {
    // Tier 1 — Offline (always available)
    globalRegistry.register(new BundledProvider());       // priority 1
    globalRegistry.register(new LocalProvider());          // priority 2

    // Tier 3 — Network (real music, no key required)
    globalRegistry.register(new CcMixterProvider());       // priority 4

    // Tier 4 — Network fallback
    globalRegistry.register(new InternetArchiveProvider());// priority 6

    // Tier 5 — Procedural (never fails)
    globalRegistry.register(new ProceduralProvider());     // priority 99
}

export { globalRegistry } from './registry';
export { BundledProvider } from './bundled';
export { LocalProvider } from './local';
export { CcMixterProvider } from './ccmixter';
// OpenLofi removed — the upstream repo removed all audio files (166 catalog entries, 0 MP3s)
// See: https://github.com/btahir/open-lofi
// export { OpenLofiProvider } from './open-lofi';
export { InternetArchiveProvider } from './internet-archive';
export { ProceduralProvider } from './procedural';
export { BaseMusicProvider, probeDuration, runFfmpeg, withSignal } from './base';
