/**
 * Agentic Video Plugins — Index & Registration
 *
 * Import this file to get access to all plugins and the registry system.
 *
 * Usage:
 *   import { createPluginRegistry, registerAllPlugins } from './src/agentic/plugins/index.js';
 *   const registry = await createPluginRegistry(context);
 *   registerAllPlugins(registry);
 */

export * from './core/types.js';
export * from './core/registry.js';
export * from './core/loader.js';

// Motion plugins
export { punchInPlugin, registerPunchIn } from './motion/punch-in.js';
export { speedRampPlugin, registerSpeedRamp, SPEED_RAMP_PRESETS } from './motion/speed-ramp.js';
export { shakePlugin, registerShake } from './motion/shake.js';
export { parallaxPlugin, registerParallax } from './motion/parallax.js';
export { kenBurnsProPlugin, registerKenBurnsPro } from './motion/ken-burns-pro.js';

// Color plugins
export { lutLoaderPlugin, registerLUTLoader, LUT_PRESETS } from './color/lut-loader.js';
export { filmGrainPlugin, registerFilmGrain } from './color/film-grain.js';
export { halationPlugin, registerHalation } from './color/halation.js';
export { colorWheelsPlugin, registerColorWheels } from './color/color-wheels.js';

// Transition plugins
export { whipPanPlugin, registerWhipPan } from './transitions/whip-pan.js';
export { glitchPlugin, registerGlitch } from './transitions/glitch.js';
export { lightLeakPlugin, registerLightLeak } from './transitions/light-leak.js';
export { morphCutPlugin, registerMorphCut } from './transitions/morph-cut.js';

// Overlay plugins
export { watermarkPlugin, registerWatermark } from './overlays/watermark.js';
export { dynamicCaptionsPlugin, registerDynamicCaptions } from './overlays/dynamic-captions.js';
export { typewriterPlugin, registerTypewriter } from './overlays/typewriter.js';
export { safeZonesPlugin, registerSafeZones } from './overlays/safe-zones.js';
export { lowerThirdPlugin, registerLowerThird } from './overlays/lower-third.js';
export { progressBarPlugin, registerProgressBar } from './overlays/progress-bar.js';

// Audio plugins
export { beatSyncPlugin, registerBeatSync } from './audio/beat-sync.js';
export { audioDuckingPlugin, registerAudioDucking } from './audio/audio-ducking.js';
export { normalizeLoudnessPlugin, registerNormalizeLoudness } from './audio/normalize-loudness.js';
export { ambienceLayerPlugin, registerAmbienceLayer } from './audio/ambience-layer.js';

// Genre plugins
export { genreStylePlugin, registerGenreStyle, getGenreStyle, listGenres } from './genres/genre-style.js';

// Platform plugins
export { platformExportPlugin, registerPlatformExport, PLATFORM_SPECS } from './platforms/platform-export.js';

import { PluginRegistry, createRegistry, getRegistry } from './core/registry.js';
import { loadPlugins, PluginLoaderOptions, createDefaultConfigFile } from './core/loader.js';
import { PluginContext } from './core/types.js';

import { registerPunchIn } from './motion/punch-in.js';
import { registerSpeedRamp } from './motion/speed-ramp.js';
import { registerShake } from './motion/shake.js';
import { registerParallax } from './motion/parallax.js';
import { registerKenBurnsPro } from './motion/ken-burns-pro.js';
import { registerLUTLoader } from './color/lut-loader.js';
import { registerFilmGrain } from './color/film-grain.js';
import { registerHalation } from './color/halation.js';
import { registerColorWheels } from './color/color-wheels.js';
import { registerWhipPan } from './transitions/whip-pan.js';
import { registerGlitch } from './transitions/glitch.js';
import { registerLightLeak } from './transitions/light-leak.js';
import { registerMorphCut } from './transitions/morph-cut.js';
import { registerWatermark } from './overlays/watermark.js';
import { registerDynamicCaptions } from './overlays/dynamic-captions.js';
import { registerTypewriter } from './overlays/typewriter.js';
import { registerSafeZones } from './overlays/safe-zones.js';
import { registerLowerThird } from './overlays/lower-third.js';
import { registerProgressBar } from './overlays/progress-bar.js';
import { registerBeatSync } from './audio/beat-sync.js';
import { registerAudioDucking } from './audio/audio-ducking.js';
import { registerNormalizeLoudness } from './audio/normalize-loudness.js';
import { registerAmbienceLayer } from './audio/ambience-layer.js';
import { registerGenreStyle } from './genres/genre-style.js';
import { registerPlatformExport } from './platforms/platform-export.js';

/**
 * Register all built-in plugins with sensible defaults
 */
export function registerAllPlugins(
    registry: PluginRegistry,
    customConfig?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>,
): void {
    const defaults = {
        'punch-in': { enabled: true, config: { autoEmphasis: true, imagesOnly: true } },
        'speed-ramp': { enabled: false, config: { defaults: [{ t: 0, speed: 1 }] } },
        shake: { enabled: false, config: { intensity: 5, frequency: 10 } },
        parallax: { enabled: false, config: {} },
        'ken-burns-pro': { enabled: true, config: { intensity: 1.0, imagesOnly: true } },
        'lut-loader': { enabled: true, config: { lutDir: './assets/luts', defaultLUT: '' } },
        'film-grain': { enabled: false, config: { strength: 0.12, size: 1.0 } },
        halation: { enabled: false, config: { threshold: 0.9, intensity: 0.3 } },
        'color-wheels': { enabled: false, config: {} },
        'whip-pan': { enabled: false, config: { direction: 'left', duration: 0.3 } },
        glitch: { enabled: false, config: { intensity: 0.5, duration: 0.2 } },
        'light-leak': { enabled: false, config: { asset: './assets/overlays/light-leak.mp4', blend: 'screen' } },
        'morph-cut': { enabled: false, config: { duration: 0.5 } },
        watermark: { enabled: true, config: { position: 'br', opacity: 0.6, scale: 0.15, margin: 20 } },
        'dynamic-captions': { enabled: true, config: { style: 'karaoke', animation: 'word-pop' } },
        typewriter: { enabled: false, config: { speed: 30, cursor: true } },
        'safe-zones': { enabled: true, config: {} },
        'lower-third': { enabled: false, config: {} },
        'progress-bar': { enabled: false, config: { color: 'white', height: 4 } },
        'beat-sync': { enabled: false, config: { minCutInterval: 1.0, maxCutInterval: 4.0 } },
        'audio-ducking': { enabled: true, config: { duckLevel: -18, attack: 0.1, release: 0.3 } },
        'normalize-loudness': { enabled: true, config: { targetLUFS: -14, truePeak: -1.0 } },
        'ambience-layer': { enabled: false, config: { volume: -24 } },
        'genre-style': { enabled: true, config: { genre: 'cinematic', overrideConfig: true } },
        'platform-export': {
            enabled: true,
            config: { platform: 'youtube', platforms: [], thumbnails: true, metadata: true, safeZones: true },
        },
    };

    const merged = { ...defaults, ...customConfig };

    registerPunchIn(registry, merged['punch-in'].config, merged['punch-in'].enabled);
    registerSpeedRamp(registry, merged['speed-ramp'].config, merged['speed-ramp'].enabled);
    registerShake(registry, merged['shake'].config, merged['shake'].enabled);
    registerParallax(registry, merged['parallax'].config, merged['parallax'].enabled);
    registerKenBurnsPro(registry, merged['ken-burns-pro'].config, merged['ken-burns-pro'].enabled);
    registerLUTLoader(registry, merged['lut-loader'].config, merged['lut-loader'].enabled);
    registerFilmGrain(registry, merged['film-grain'].config, merged['film-grain'].enabled);
    registerHalation(registry, merged['halation'].config, merged['halation'].enabled);
    registerColorWheels(registry, merged['color-wheels'].config, merged['color-wheels'].enabled);
    registerWhipPan(registry, merged['whip-pan'].config, merged['whip-pan'].enabled);
    registerGlitch(registry, merged['glitch'].config, merged['glitch'].enabled);
    registerLightLeak(registry, merged['light-leak'].config, merged['light-leak'].enabled);
    registerMorphCut(registry, merged['morph-cut'].config, merged['morph-cut'].enabled);
    registerWatermark(registry, merged['watermark'].config as any, merged['watermark'].enabled);
    registerDynamicCaptions(registry, merged['dynamic-captions'].config as any, merged['dynamic-captions'].enabled);
    registerTypewriter(registry, merged['typewriter'].config as any, merged['typewriter'].enabled);
    registerSafeZones(registry, merged['safe-zones'].config as any, merged['safe-zones'].enabled);
    registerLowerThird(registry, merged['lower-third'].config as any, merged['lower-third'].enabled);
    registerProgressBar(registry, merged['progress-bar'].config as any, merged['progress-bar'].enabled);
    registerBeatSync(registry, merged['beat-sync'].config as any, merged['beat-sync'].enabled);
    registerAudioDucking(registry, merged['audio-ducking'].config as any, merged['audio-ducking'].enabled);
    registerNormalizeLoudness(
        registry,
        merged['normalize-loudness'].config as any,
        merged['normalize-loudness'].enabled,
    );
    registerAmbienceLayer(registry, merged['ambience-layer'].config as any, merged['ambience-layer'].enabled);
    registerGenreStyle(registry, merged['genre-style'].config as any, merged['genre-style'].enabled);
    registerPlatformExport(registry, merged['platform-export'].config as any, merged['platform-export'].enabled);
}

/**
 * Create registry, load plugins, register all built-ins
 */
export async function createPluginRegistry(
    context: PluginContext,
    options?: PluginLoaderOptions,
): Promise<PluginRegistry> {
    const registry = createRegistry(context);
    registerAllPlugins(registry);

    if (options) {
        const resolved = await loadPlugins(options);
        // Merge back: loadPlugins already called invokeOnLoad
        return resolved;
    }

    await registry.invokeOnLoad();
    return registry;
}

/**
 * Quick setup for autopilot / CLI usage
 */
export async function setupPluginsForAutopilot(
    jobId: string,
    workspaceRoot: string,
    config: Record<string, unknown>,
): Promise<PluginRegistry> {
    const context = new PluginContext({ jobId, workspaceRoot, config });
    const registry = await createPluginRegistry(context);
    context.setShared('pluginRegistry', registry);
    return registry;
}

export { PluginRegistry, createRegistry, loadPlugins, createDefaultConfigFile };
export type { PluginLoaderOptions };
