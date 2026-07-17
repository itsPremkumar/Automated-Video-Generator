/**
 * Plugin Registry — Central plugin management system.
 * Loads, validates, and executes plugin hooks in priority order.
 * Zero dependencies on main agentic codebase.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    AgenticPlugin,
    PluginCategory,
    PluginRegistryEntry,
    PluginContext,
    PluginPlan,
    PluginAssets,
    PluginStylePlan,
    PluginFilterGraph,
    PluginRenderScene,
    PluginGateCheck,
    categoryPriority,
} from './types.js';

export class PluginRegistry {
    private entries: Map<string, PluginRegistryEntry> = new Map();
    private loadOrder: string[] = [];
    private context: PluginContext;

    constructor(context: PluginContext) {
        this.context = context;
    }

    /** Register a plugin instance */
    register(plugin: AgenticPlugin, config: Record<string, unknown> = {}, enabled = true): void {
        const existing = this.entries.get(plugin.metadata.name);
        if (existing) {
            console.warn(`[PluginRegistry] Plugin "${plugin.metadata.name}" already registered, overwriting`);
        }

        const entry: PluginRegistryEntry = {
            plugin,
            enabled,
            config: { ...plugin.defaultConfig, ...plugin.getDefaultConfig?.(), ...config },
            loadOrder: this.loadOrder.length,
        };

        this.entries.set(plugin.metadata.name, entry);
        this.loadOrder.push(plugin.metadata.name);

        // Sort by category priority descending (genre first, utility last)
        this.loadOrder.sort((a, b) => {
            const eA = this.entries.get(a)!;
            const eB = this.entries.get(b)!;
            return categoryPriority(eB.plugin.category) - categoryPriority(eA.plugin.category);
        });

        console.log(`[PluginRegistry] Registered: ${plugin.metadata.name} v${plugin.metadata.version} [${plugin.category}]`);
    }

    /** Load all plugins from a directory (auto-discovery) */
    async loadFromDirectory(dir: string): Promise<number> {
        if (!fs.existsSync(dir)) {
            console.warn(`[PluginRegistry] Plugin directory not found: ${dir}`);
            return 0;
        }

        const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') || f.endsWith('.ts'));
        let loaded = 0;

        for (const file of files) {
            const filePath = path.join(dir, file);
            try {
                const mod = await import(filePath);
                const plugin: AgenticPlugin | undefined = mod.default ?? mod.plugin;
                if (plugin && isValidPluginShape(plugin)) {
                    this.register(plugin);
                    loaded++;
                }
            } catch (e) {
                console.error(`[PluginRegistry] Failed to load ${file}:`, e);
            }
        }

        console.log(`[PluginRegistry] Loaded ${loaded} plugins from ${dir}`);
        return loaded;
    }

    /** Enable/disable a plugin */
    setEnabled(name: string, enabled: boolean): boolean {
        const entry = this.entries.get(name);
        if (!entry) return false;
        entry.enabled = enabled;
        return true;
    }

    /** Update plugin config */
    setConfig(name: string, config: Record<string, unknown>): boolean {
        const entry = this.entries.get(name);
        if (!entry) return false;
        entry.config = { ...entry.config, ...config };
        return true;
    }

    /** Get plugin entry */
    get(name: string): PluginRegistryEntry | undefined {
        return this.entries.get(name);
    }

    /** Get all registered plugins (in execution order) */
    getAll(): PluginRegistryEntry[] {
        return this.loadOrder.map(name => this.entries.get(name)!).filter(Boolean);
    }

    /** Get enabled plugins in execution order */
    getEnabled(): PluginRegistryEntry[] {
        return this.getAll().filter(e => e.enabled);
    }

    /** ── Hook invocations ── */

    async invokeOnLoad(): Promise<void> {
        for (const e of this.getEnabled()) {
            await e.plugin.hooks.onLoad?.(this.context);
        }
    }

    async invokeOnPlan(plan: PluginPlan): Promise<PluginPlan> {
        let cur = plan;
        for (const e of this.getEnabled()) {
            if (e.plugin.hooks.onPlan) cur = await e.plugin.hooks.onPlan(cur, this.context);
        }
        return cur;
    }

    async invokeOnAcquire(assets: PluginAssets): Promise<PluginAssets> {
        let cur = assets;
        for (const e of this.getEnabled()) {
            if (e.plugin.hooks.onAcquire) cur = await e.plugin.hooks.onAcquire(cur, this.context);
        }
        return cur;
    }

    async invokeOnStyle(style: PluginStylePlan): Promise<PluginStylePlan> {
        let cur = style;
        for (const e of this.getEnabled()) {
            if (e.plugin.hooks.onStyle) cur = await e.plugin.hooks.onStyle(cur, this.context);
        }
        return cur;
    }

    async invokeOnRenderFilter(scene: PluginRenderScene): Promise<PluginRenderScene> {
        let cur = scene;
        for (const e of this.getEnabled()) {
            if (e.plugin.hooks.onRenderFilter) cur = await e.plugin.hooks.onRenderFilter(cur, this.context);
        }
        return cur;
    }

    async invokeOnRender(filtergraph: PluginFilterGraph): Promise<PluginFilterGraph> {
        let cur = filtergraph;
        for (const e of this.getEnabled()) {
            if (e.plugin.hooks.onRender) cur = await e.plugin.hooks.onRender(cur, this.context);
        }
        return cur;
    }

    async invokeOnPostRender(outputPath: string): Promise<string> {
        let cur = outputPath;
        for (const e of this.getEnabled()) {
            if (e.plugin.hooks.onPostRender) cur = await e.plugin.hooks.onPostRender(cur, this.context);
        }
        return cur;
    }

    async invokeOnGate(results: PluginGateCheck[]): Promise<PluginGateCheck[]> {
        let cur = results;
        for (const e of this.getEnabled()) {
            if (e.plugin.hooks.onGate) cur = await e.plugin.hooks.onGate(cur, this.context);
        }
        return cur;
    }

    async invokeOnError(error: Error): Promise<void> {
        for (const e of this.getEnabled()) {
            try { await e.plugin.hooks.onError?.(error, this.context); } catch { /* ignore hook errors */ }
        }
    }

    async invokeOnUnload(): Promise<void> {
        for (const e of this.getEnabled()) {
            try { await e.plugin.hooks.onUnload?.(this.context); } catch { /* ignore */ }
        }
    }

    /** Export registry state */
    toJSON(): Record<string, unknown> {
        return {
            plugins: this.getAll().map(e => ({
                name: e.plugin.metadata.name,
                version: e.plugin.metadata.version,
                category: e.plugin.category,
                enabled: e.enabled,
                config: e.config,
            })),
        };
    }
}

function isValidPluginShape(obj: unknown): obj is AgenticPlugin {
    if (!obj || typeof obj !== 'object') return false;
    const p = obj as Record<string, unknown>;
    return typeof p.metadata === 'object' && typeof p.category === 'string' && typeof p.hooks === 'object';
}

/** Global registry singleton */
let globalRegistry: PluginRegistry | null = null;

export function createRegistry(context: PluginContext): PluginRegistry {
    globalRegistry = new PluginRegistry(context);
    return globalRegistry;
}

export function getRegistry(): PluginRegistry | null {
    return globalRegistry;
}

export function setRegistry(registry: PluginRegistry): void {
    globalRegistry = registry;
}