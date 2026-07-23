/**
 * Plugin Loader — Dynamic plugin loading with config support.
 * Reads plugin configs from JSON files, loads plugins, applies config.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logInfo, logWarn, logError } from '../../../shared/logging/runtime-logging.js';
import { PluginRegistry, createRegistry, getRegistry } from './registry.js';
import { PluginContext, AgenticPlugin } from './types.js';

export interface PluginConfig {
    name: string;
    enabled: boolean;
    config: Record<string, unknown>;
    path?: string;
    package?: string;
}

export interface PluginLoaderOptions {
    pluginsDir: string;
    configFile?: string;
    context: PluginContext;
    autoDiscover?: boolean;
}

const DEFAULT_PLUGIN_CONFIG: PluginConfig[] = [
    { name: 'punch-in', enabled: true, config: {} },
    { name: 'ken-burns-pro', enabled: true, config: {} },
    { name: 'speed-ramp', enabled: false, config: {} },
    { name: 'shake', enabled: false, config: {} },
    { name: 'parallax', enabled: false, config: {} },
    { name: 'lut-loader', enabled: true, config: { lutDir: './assets/luts' } },
    { name: 'film-grain', enabled: false, config: { strength: 0.15 } },
    { name: 'halation', enabled: false, config: {} },
    { name: 'color-wheels', enabled: false, config: {} },
    { name: 'whip-pan', enabled: false, config: {} },
    { name: 'glitch', enabled: false, config: {} },
    { name: 'light-leak', enabled: false, config: {} },
    { name: 'morph-cut', enabled: false, config: {} },
    { name: 'watermark', enabled: true, config: { position: 'bottom-right', opacity: 0.7 } },
    { name: 'dynamic-captions', enabled: true, config: {} },
    { name: 'typewriter', enabled: false, config: {} },
    { name: 'safe-zones', enabled: true, config: {} },
    { name: 'lower-third', enabled: false, config: {} },
    { name: 'progress-bar', enabled: false, config: {} },
    { name: 'beat-sync', enabled: false, config: {} },
    { name: 'audio-ducking', enabled: true, config: { duckLevel: -18 } },
    { name: 'normalize-loudness', enabled: true, config: { targetLUFS: -14 } },
    { name: 'ambience-layer', enabled: false, config: { volume: -24 } },
    { name: 'genre-style', enabled: true, config: { genre: 'cinematic' } },
    { name: 'platform-export', enabled: true, config: {} },
];

export async function loadPlugins(options: PluginLoaderOptions): Promise<PluginRegistry> {
    const { pluginsDir, configFile, context, autoDiscover = true } = options;
    const registry = createRegistry(context);

    const pluginConfigs = loadPluginConfig(configFile);

    if (autoDiscover && fs.existsSync(pluginsDir)) {
        const categories = fs
            .readdirSync(pluginsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);

        for (const category of categories) {
            if (category === 'core' || category === 'registry') continue;
            const categoryDir = path.join(pluginsDir, category);
            await registry.loadFromDirectory(categoryDir);
        }
    }

    for (const pc of pluginConfigs) {
        const entry = registry.get(pc.name);
        if (entry) {
            registry.setEnabled(pc.name, pc.enabled);
            if (Object.keys(pc.config).length > 0) {
                registry.setConfig(pc.name, pc.config);
            }
        } else if (pc.path || pc.package) {
            await loadExternalPlugin(registry, pc);
        }
    }

    await registry.invokeOnLoad();
    logInfo(`[PluginLoader] Loaded ${registry.getEnabled().length} enabled plugins`);
    return registry;
}

function loadPluginConfig(configFile?: string): PluginConfig[] {
    if (!configFile) return DEFAULT_PLUGIN_CONFIG;
    const fullPath = path.resolve(configFile);
    if (!fs.existsSync(fullPath)) {
        console.warn(`[PluginLoader] Config not found: ${fullPath}, using defaults`);
        return DEFAULT_PLUGIN_CONFIG;
    }
    try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(content);
        // Support both { plugins: [...] } and plain array
        return (parsed.plugins ?? parsed) as PluginConfig[];
    } catch (e) {
        console.error(`[PluginLoader] Parse error ${fullPath}:`, e);
        return DEFAULT_PLUGIN_CONFIG;
    }
}

async function loadExternalPlugin(registry: PluginRegistry, config: PluginConfig): Promise<void> {
    let plugin: AgenticPlugin | null = null;
    if (config.path) {
        try {
            const mod = await import(path.resolve(config.path));
            plugin = mod.default ?? mod.plugin;
        } catch (e) {
            console.error(`[PluginLoader] Failed to load ${config.path}:`, e);
        }
    } else if (config.package) {
        try {
            const mod = await import(config.package);
            plugin = mod.default ?? mod.plugin;
        } catch (e) {
            console.error(`[PluginLoader] Failed to load package ${config.package}:`, e);
        }
    }
    if (plugin) registry.register(plugin, config.config, config.enabled);
}

export function createDefaultConfigFile(outputPath: string): void {
    fs.writeFileSync(
        outputPath,
        JSON.stringify(
            DEFAULT_PLUGIN_CONFIG.map((p) => ({ name: p.name, enabled: p.enabled, config: p.config })),
            null,
            2,
        ),
    );
    logInfo(`[PluginLoader] Created default config at ${outputPath}`);
}

export function getPluginRegistry(): PluginRegistry | null {
    return getRegistry();
}
