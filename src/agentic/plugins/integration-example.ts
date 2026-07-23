/**
 * Plugin Integration Example — How to use the plugin system with the agentic pipeline
 *
 * This file shows how to integrate plugins without modifying core agentic code.
 * Place this in your custom entry point or import in autopilot.ts
 */

import { createPluginRegistry, setupPluginsForAutopilot, getPluginRegistry, registerAllPlugins } from './index.js';
import { logInfo, logWarn, logError } from '../../shared/logging/runtime-logging.js';
import { PluginPlan, PluginAssets, PluginStylePlan, PluginFilterGraph } from './core/types.js';
import { runAgenticPipeline, renderAgenticSlideshow, PipelineRequest } from '../orchestrate.js';
import { PluginContext } from './core/types.js';

/**
 * Example 1: Using plugins with autopilot (recommended)
 */
export async function runWithPluginsAutopilot(
    topic: string,
    title: string,
    options: {
        configPath?: string;
        pluginConfig?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
    } = {},
): Promise<string> {
    // 1. Setup plugins
    const registry = await setupPluginsForAutopilot(
        `job_${Date.now()}`,
        `./workspace/jobs/job_${Date.now()}`,
        { topic, title, ...options },
    );

    // 2. Apply custom plugin config if provided
    if (options.pluginConfig) {
        for (const [name, cfg] of Object.entries(options.pluginConfig)) {
            registry.setEnabled(name, cfg.enabled ?? true);
            if (cfg.config) registry.setConfig(name, cfg.config);
        }
    }

    // 3. Run pipeline with plugin hooks integrated
    const req: PipelineRequest = {
        topic,
        title,
        backend: 'agent',
        // Plugin configs passed via context
    };

    const res = await runAgenticPipeline(req, (progress) => {
        logInfo(`[${progress.stage}] ${progress.percent}% - ${progress.message}`);
    });

    // 4. Apply plugin render modifications
    const pluginRegistry = getPluginRegistry();
    if (pluginRegistry) {
        // Get the base filtergraph from pipeline
        const filtergraph = res.workspace; // Contains render manifest

        // Run plugin render hooks
        const enhancedFiltergraph = await pluginRegistry.invokeOnRender(filtergraph as any);

        // Render with enhanced filtergraph
        const output = await renderAgenticSlideshow(res, {
            // Pass enhanced filtergraph options
        });

        // Post-render hooks (thumbnails, metadata, transcode)
        await pluginRegistry.invokeOnPostRender(output);

        return output;
    }

    // Fallback: standard render
    return await renderAgenticSlideshow(res);
}

/**
 * Example 2: Manual plugin integration (for custom pipelines)
 */
export async function runWithPluginsManual(topic: string, title: string, customPlugins?: string[]): Promise<string> {
    // Create context
    const jobId = `job_${Date.now()}`;
    const context = new PluginContext({
        jobId,
        workspaceRoot: `./workspace/jobs/${jobId}`,
        config: { topic, title },
    });

    // Create and populate registry
    const registry = await createPluginRegistry(context);
    registerAllPlugins(registry, {
        'genre-style': { enabled: true, config: { genre: 'reels' } },
        'platform-export': { enabled: true, config: { platforms: ['tiktok', 'reels'] } },
    });

    // Enable custom plugins
    for (const name of customPlugins ?? []) {
        registry.setEnabled(name, true);
    }

    // Initialize
    await registry.invokeOnLoad();

    // Run pipeline stages with plugin hooks
    // Stage 1: Plan
    let plan: PluginPlan = {
        topic,
        title,
        orientation: 'portrait',
        aspect: '9:16',
        scenes: [
            {
                sceneNumber: 1,
                voiceoverText: 'Hook',
                searchKeywords: ['hook'],
                visualPreference: 'image',
                durationSec: 3,
                metadata: {},
            },
            {
                sceneNumber: 2,
                voiceoverText: 'Content',
                searchKeywords: ['content'],
                visualPreference: 'image',
                durationSec: 4,
                metadata: {},
            },
        ],
        totalDurationSec: 7,
        metadata: {},
    };

    plan = await registry.invokeOnPlan(plan);

    // Stage 2: Acquire (mock)
    let assets: PluginAssets = { scenes: [], music: [], metadata: {} };
    assets = await registry.invokeOnAcquire(assets);

    // Stage 3: Style
    let style: PluginStylePlan = { preset: 'reels', transitions: [], grades: [], kinetics: [], metadata: {} };
    style = await registry.invokeOnStyle(style);

    // Stage 4: Render
    let filtergraph: PluginFilterGraph = { videoInputs: [], audioInputs: [], filters: [], outputs: [], metadata: {} };
    filtergraph = await registry.invokeOnRender(filtergraph);

    // Render video
    // const output = await renderAgenticSlideshow(plan, filtergraph);

    // Stage 5: Post-render
    // await registry.invokeOnPostRender(output);

    return 'output.mp4';
}

/**
 * Example 3: CLI Integration
 *
 * Usage in bin/agentic-auto.ts or similar:
 *
 * import { createPluginRegistry, registerAllPlugins } from '../src/agentic/plugins/index.js';
 *
 * const registry = await createPluginRegistry(context);
 * registerAllPlugins(registry, customConfigFromCLI);
 *
 * // Then in pipeline stages, call:
 * plan = await registry.invokeOnPlan(plan);
 * style = await registry.invokeOnStyle(style);
 * filtergraph = await registry.invokeOnRender(filtergraph);
 * await registry.invokeOnPostRender(outputPath);
 */

/**
 * Example 4: Creating a Custom Plugin
 *
 * Create file: ./my-plugins/custom-effect.ts
 *
 * import { AgenticPlugin, PluginCategory, Capability } from '../src/agentic/plugins/core/types.js';
 *
 * export const customEffectPlugin: AgenticPlugin = {
 *     metadata: {
 *         name: 'custom-effect',
 *         version: '1.0.0',
 *         description: 'My custom effect',
 *     },
 *     capabilities: [Capability.MOTION_KEYFRAMES],
 *     category: PluginCategory.MOTION,
 *     defaultConfig: { intensity: 1.0 },
 *     hooks: {
 *         onRenderFilter: async (scene, ctx) => {
 *             const cfg = ctx.getConfig('custom-effect');
 *             // Add custom filter
 *             return { ...scene, filterChain: scene.filterChain + ',custom=filter' };
 *         }
 *     }
 * };
 *
 * // Register:
 * import { customEffectPlugin } from './my-plugins/custom-effect.js';
 * registry.register(customEffectPlugin, { intensity: 0.8 }, true);
 */

// Export for use in other entry points
export { createPluginRegistry, registerAllPlugins, getPluginRegistry };
