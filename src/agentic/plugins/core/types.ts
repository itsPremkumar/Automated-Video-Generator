/**
 * Plugin Type Definitions — Core interfaces for the agentic video plugin system.
 * Zero dependencies on main codebase. Plugins register via PluginRegistry.
 */

/**
 * Capability flags — what a plugin can do. Used by the registry for capability-based routing.
 */
export enum Capability {
    MOTION_KEYFRAMES = 'motion:keyframes',
    TIME_REMAP = 'motion:time-remap',
    TRANSITION_ADVANCED = 'transition:advanced',
    TRANSITION_CUSTOM = 'transition:custom',
    COLOR_GRADING = 'color:grading',
    LUT_SUPPORT = 'color:lut',
    OVERLAY_STATIC = 'overlay:static',
    OVERLAY_ANIMATED = 'overlay:animated',
    AUDIO_ANALYSIS = 'audio:analysis',
    GENRE_TEMPLATE = 'genre:template',
    PLATFORM_EXPORT = 'platform:export',
    THUMBNAIL_GENERATION = 'platform:thumbnail',
    METADATA_GENERATION = 'platform:metadata',
    SAFE_ZONES = 'platform:safe-zones',
    CONFIG_OVERRIDE = 'config:override',
    VISION_ANALYSIS = 'vision:analysis',
    SCRIPT_ANALYSIS = 'script:analysis',
}

/**
 * Plugin category — determines execution order:
 * genre(100) > motion(90) > color(80) > transition(70) > overlay(60) > audio(50) > platform(40) > utility(10)
 */
export enum PluginCategory {
    GENRE = 'genre',
    MOTION = 'motion',
    COLOR = 'color',
    TRANSITION = 'transition',
    OVERLAY = 'overlay',
    AUDIO = 'audio',
    PLATFORM = 'platform',
    UTILITY = 'utility',
}

export function categoryPriority(cat: PluginCategory): number {
    const map: Record<PluginCategory, number> = {
        [PluginCategory.GENRE]: 100,
        [PluginCategory.MOTION]: 90,
        [PluginCategory.COLOR]: 80,
        [PluginCategory.TRANSITION]: 70,
        [PluginCategory.OVERLAY]: 60,
        [PluginCategory.AUDIO]: 50,
        [PluginCategory.PLATFORM]: 40,
        [PluginCategory.UTILITY]: 10,
    };
    return map[cat] ?? 10;
}

export interface PluginMetadata {
    name: string;
    version: string;
    description: string;
    author?: string;
    license?: string;
    tags?: string[];
    /** Minimum agentic-core version required (semver) */
    peerDependency?: string;
}

export interface PluginCapability {
    id: string;
    label: string;
    configSchema: Record<string, unknown>;
    defaults: Record<string, unknown>;
    tags: string[];
}

/** Plugin lifecycle hooks */
export interface PluginHooks {
    onLoad?: (ctx: PluginContext) => Promise<void> | void;
    onPlan?: (plan: PluginPlan, ctx: PluginContext) => Promise<PluginPlan> | PluginPlan;
    onAcquire?: (assets: PluginAssets, ctx: PluginContext) => Promise<PluginAssets> | PluginAssets;
    onStyle?: (style: PluginStylePlan, ctx: PluginContext) => Promise<PluginStylePlan> | PluginStylePlan;
    /** Called per scene during filtergraph construction */
    onRenderFilter?: (scene: PluginRenderScene, ctx: PluginContext) => Promise<PluginRenderScene> | PluginRenderScene;
    onRender?: (filtergraph: PluginFilterGraph, ctx: PluginContext) => Promise<PluginFilterGraph> | PluginFilterGraph;
    onPostRender?: (output: string, ctx: PluginContext) => Promise<string> | string;
    /** Called after gate X7-X15 checks */
    onGate?: (results: PluginGateCheck[], ctx: PluginContext) => Promise<PluginGateCheck[]> | PluginGateCheck[];
    onError?: (error: Error, ctx: PluginContext) => Promise<void> | void;
    onUnload?: (ctx: PluginContext) => Promise<void> | void;
}

/** A single scene passed to onRenderFilter */
export interface PluginRenderScene {
    sceneIndex: number;
    kind: 'image' | 'video' | 'card';
    localPath: string;
    durationSec: number;
    filterChain: string;
    punchIn?: { atSec: number; scale: number; dur: number; easing?: string; trigger?: string };
    speedRamp?: { t: number; speed: number }[];
    lut?: string;
    lutIntensity?: number;
    transition?: string;
    transitionParams?: Record<string, unknown>;
    transitionDuration?: number;
    genreStyle?: unknown;
    config?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

/** Gate check result passed to onGate */
export interface PluginGateCheck {
    id: string;
    pass: boolean;
    label: string;
    detail: string;
}

/**
 * PluginContext — shared state across all hooks for a single pipeline run.
 * Implemented as a class so plugins have guaranteed getConfig/getShared methods.
 */
export class PluginContext {
    readonly jobId: string;
    readonly workspaceRoot: string;
    readonly config: Record<string, unknown>;
    readonly metadata: Record<string, unknown>;
    private _shared: Map<string, unknown> = new Map();

    constructor(opts: {
        jobId: string;
        workspaceRoot: string;
        config: Record<string, unknown>;
        metadata?: Record<string, unknown>;
        shared?: Map<string, unknown>;
    }) {
        this.jobId = opts.jobId;
        this.workspaceRoot = opts.workspaceRoot;
        this.config = opts.config;
        this.metadata = opts.metadata ?? {};
        this._shared = opts.shared ?? new Map();
    }

    /** Get typed config for a specific plugin */
    getConfig<T = Record<string, unknown>>(pluginName: string): T {
        const cfg = (this.config as Record<string, Record<string, unknown>>)?.[pluginName];
        return (cfg ?? {}) as T;
    }

    /** Get shared value (cross-plugin data exchange) */
    getShared<T>(key: string): T | undefined {
        return this._shared.get(key) as T | undefined;
    }

    /** Set shared value */
    setShared(key: string, value: unknown): void {
        this._shared.set(key, value);
    }

    /** Get all shared keys */
    get sharedKeys(): string[] {
        return Array.from(this._shared.keys());
    }

    /** Clone context for a new job */
    clone(opts?: Partial<{ jobId: string; workspaceRoot: string; config: Record<string, unknown> }>): PluginContext {
        return new PluginContext({
            jobId: opts?.jobId ?? this.jobId,
            workspaceRoot: opts?.workspaceRoot ?? this.workspaceRoot,
            config: opts?.config ?? this.config,
            metadata: { ...this.metadata },
            shared: new Map(this._shared),
        });
    }
}

/** Plan structure for onPlan hook */
export interface PluginPlan {
    title: string;
    topic: string;
    orientation: 'portrait' | 'landscape';
    aspect: string;
    scenes: PluginScene[];
    totalDurationSec: number;
    metadata: Record<string, unknown>;
}

export interface PluginScene {
    sceneNumber: number;
    voiceoverText: string;
    searchKeywords: string[];
    visualPreference: 'image' | 'video';
    durationSec: number;
    localAsset?: string;
    beatAligned?: boolean;
    punchIn?: { atSec: number; scale: number; dur: number; easing?: string; trigger?: string };
    speedRamp?: { t: number; speed: number }[];
    lut?: string;
    lutIntensity?: number;
    transition?: string;
    transitionParams?: Record<string, unknown>;
    transitionDuration?: number;
    genreStyle?: unknown;
    metadata: Record<string, unknown>;
}

/** Assets structure for onAcquire hook */
export interface PluginAssets {
    scenes: PluginSceneAssets[];
    music: PluginMusicAsset[];
    metadata: Record<string, unknown>;
}

export interface PluginSceneAssets {
    sceneIndex: number;
    candidates: PluginAssetCandidate[];
    selected?: PluginAssetCandidate;
    metadata: Record<string, unknown>;
}

export interface PluginAssetCandidate {
    id: string;
    url: string;
    localPath?: string;
    source: string;
    width?: number;
    height?: number;
    durationSec?: number;
    license?: string;
    metadata: Record<string, unknown>;
}

export interface PluginMusicAsset {
    id: string;
    localPath: string;
    source: string;
    license?: string;
    durationSec: number;
    metadata: Record<string, unknown>;
}

/** Style plan for onStyle hook */
export interface PluginStylePlan {
    preset: string;
    transitions: PluginTransition[];
    grades: PluginGrade[];
    kinetics: PluginKinetic[];
    metadata: Record<string, unknown>;
}

export interface PluginTransition {
    sceneIndex: number;
    type: string;
    durationSec: number;
    params: Record<string, unknown>;
}

export interface PluginGrade {
    sceneIndex: number;
    type: string;
    filter: string;
    params: Record<string, unknown>;
}

export interface PluginKinetic {
    sceneIndex: number;
    cues: PluginKineticCue[];
}

export interface PluginKineticCue {
    atSec: number;
    text: string;
    kind: 'lowerthird' | 'wordpop' | 'typewriter' | 'custom';
    style: Record<string, unknown>;
    metadata: Record<string, unknown>;
}

/** Filtergraph for onRender hook */
export interface PluginFilterGraph {
    videoInputs: string[];
    audioInputs: string[];
    filters: PluginFilter[];
    outputs: PluginOutput[];
    metadata: Record<string, unknown>;
}

export interface PluginFilter {
    id: string;
    type: 'video' | 'audio' | 'complex';
    filter: string;
    inputs: string[];
    outputs: string[];
    enabled: boolean;
    order: number;
    metadata: Record<string, unknown>;
}

export interface PluginOutput {
    path: string;
    map: string[];
    options: Record<string, unknown>;
}

/** Full plugin definition */
export interface AgenticPlugin {
    metadata: PluginMetadata;
    category: PluginCategory;
    capabilities?: Capability[];
    hooks: PluginHooks;
    /** Default config as object (used by registry.register) */
    defaultConfig?: Record<string, unknown>;
    /** Or as a function */
    getDefaultConfig?: () => Record<string, unknown>;
    validateConfig?: (config: Record<string, unknown>) => { valid: boolean; errors: string[] };
}

/** Plugin registry entry */
export interface PluginRegistryEntry {
    plugin: AgenticPlugin;
    enabled: boolean;
    config: Record<string, unknown>;
    loadOrder: number;
}