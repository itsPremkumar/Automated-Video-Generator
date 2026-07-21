/**
 * src/music-system/providers/registry.ts
 * Provider registry — plugins register themselves here.
 * Anyone can add a provider without modifying core.
 */

import type { MusicProvider } from '../types';
import { globalEventBus } from '../events';

export class ProviderRegistry {
    private providers: Map<string, MusicProvider> = new Map();

    /** Register a provider (sorted by priority). If name already exists, skip. */
    register(provider: MusicProvider): void {
        if (this.providers.has(provider.name)) {
            return; // idempotent — no double-registration
        }
        this.providers.set(provider.name, provider);
        globalEventBus.emit({
            type: 'provider:search:start',
            provider: provider.name,
        });
    }

    /** Get a provider by name */
    get(name: string): MusicProvider | undefined {
        return this.providers.get(name);
    }

    /** All providers (sorted by priority ascending) */
    getAll(): MusicProvider[] {
        return [...this.providers.values()].sort((a, b) => a.priority - b.priority);
    }

    /** Only offline providers */
    getOffline(): MusicProvider[] {
        return this.getAll().filter(p => !p.requiresNetwork);
    }

    /** Only online providers */
    getOnline(): MusicProvider[] {
        return this.getAll().filter(p => p.requiresNetwork);
    }

    /** Remove a provider */
    unregister(name: string): boolean {
        return this.providers.delete(name);
    }

    /** Remove all providers */
    clear(): void {
        this.providers.clear();
    }

    /** Number of registered providers */
    get size(): number {
        return this.providers.size;
    }

    /** List all provider names */
    listNames(): string[] {
        return [...this.providers.keys()];
    }
}

/** Global singleton registry */
export const globalRegistry = new ProviderRegistry();
