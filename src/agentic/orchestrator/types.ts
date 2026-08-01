export type { PipelineResult, PipelineProgress } from '../types.js';

import type { AgenticBackend, AgentBackendConfig } from '../ai/agent.js';
import type { DriverLlmCallback } from '../ai/bridge.js';

export interface PipelineRequest {
    /** Custom script with [Visual: ...] and [Text: ...] tags.
     *  When provided, the agentic pipeline uses this script directly instead of
     *  auto-generating one from `topic`/`title`. Supports both local assets
     *  ([Visual: logo.png]) and online stock keywords ([Visual: ai coding]).
     *  Local files are resolved from input/visuals/ (same as legacy pipeline). */
    script?: string;
    topic: string;
    title: string;
    jobId?: string;
    orientation?: 'portrait' | 'landscape' | 'square';
    voice?: string;
    musicQuery?: string;
    /** Opt out of background music entirely (voice-over only final).
     *  Defaults to true when musicQuery is set; set false for a
     *  music-free variety proof. */
    music?: boolean;
    candidatesPerAsset?: number;
    backend?: AgenticBackend;
    preferVisual?: 'image' | 'video';
    agent?: Partial<AgentBackendConfig>;
    dryRun?: boolean;
    localAssets?: string[];
    /** Opt-in auto-detect of input/visuals/ media (default false). See
     *  AgenticConfig.autoLocalAssets — off by default so stock acquisition is
     *  not silently hijacked by whatever sits in input/visuals/. */
    autoLocalAssets?: boolean;
    videoClips?: string[];
    personalAudio?: string[];
    defaultVisual?: string;
    hookFirst?: boolean;
    variablePacing?: boolean;
    driverLLM?: DriverLlmCallback;
    /** Language code for auto-voice selection (e.g. 'tamil', 'hindi', 'spanish'). */
    language?: string;
    /** Filename of a local audio file in input/visuals/ for background music. */
    backgroundMusic?: string;
    /** Volume for background music (0.0–1.0, default ~0.15). */
    musicVolume?: number;
    /** Branded title card at the start. */
    intro?: { title: string; subtitle?: string; durationSec?: number };
    /** Branded CTA card at the end. */
    outro?: { ctaText: string; showSubscribe?: boolean; hashtags?: string[]; durationSec?: number };
    // ═══════════════════════════════════════════════
    //  PHASE 1 — Extended customization fields
    // ═══════════════════════════════════════════════
    /** Named caption theme preset (e.g. 'minimal', 'cinematic', 'neon', 'retro'). */
    captionTheme?: string;
    /** Caption rendering mode. */
    captions?: 'burned' | 'karaoke' | 'none';
    /** Enable transition sound effects. */
    sfx?: boolean;
    /** J-cut: next scene's voiceover leads picture by N seconds. */
    jCutSec?: number;
    /** Named format preset ('shorts' | 'reels' | 'tiktok' | 'square' | 'landscape' | 'explainer' | 'promo'). */
    format?: string;
    /** Named visual preset ('cinematic' | 'reels' | 'documentary' | ...). */
    preset?: string;
    /** Override default aspect ratio. */
    aspect?: '9:16' | '1:1' | '16:9' | 'square';
    /** Enable/disable cinematic vignette edge darkening (default on). */
    vignette?: boolean;
    /** Enable animated kinetic lower-third text pops (default on). */
    kineticText?: boolean;
    /** Background music ducking depth. */
    musicIntensity?: 'calm' | 'mid' | 'energetic';
    /** Target platform for auto-tailoring. */
    platform?: 'tiktok' | 'youtube' | 'instagram' | 'reels';
    /** Video content type for template selection. */
    videoType?: 'facts' | 'tutorial' | 'news' | 'story' | 'product' | 'motivational' | 'nature';
    /** Branding config. */
    brand?: { watermark?: string; accent?: string };
    /** Render engine ('ffmpeg'=default, 'remotion'=alternative). */
    renderer?: 'ffmpeg' | 'remotion';
    /** Retry budget for autopilot. */
    maxAttempts?: number;
    /** Extra languages for subtitle sidecars. */
    languages?: string[];
    /** Global Ken Burns toggle (default on). */
    kenBurns?: boolean;
    /** Global transition override. */
    transition?: string;
    /** Global grade override. */
    grade?: string;
    /** OPT-IN AI visual/audio verification (reuses the agent's own model). */
    aiVerify?: import('../config.js').AgenticConfig['aiVerify'];
    /** Workspace retention budget (how many workspaces to keep after pruning). */
    pruneWorkspaces?: number;
    /** Model circuit-breaker budget for the agent brain. */
    brain?: { maxCalls?: number; maxFails?: number };
    // ═══════════════════════════════════════════════
    //  Advanced Feature Block — forwarded from agentic-scripts.json so the
    //  Remotion render path can also consume every optional editor signal.
    // ═══════════════════════════════════════════════
    sfxByScene?: Record<number, string>;
    sfxOnCut?: boolean;
    normalizeLufs?: number;
    loopMusic?: boolean;
    ttsStyle?: string;
    voicesByScene?: Record<number, string>;
    voiceSpeed?: number;
    voicePitchSemitones?: number;
    voiceAging?: 'younger' | 'older';
    dubLanguage?: string;
    useClonedVoiceId?: string;
    dialogueVoices?: [string, string];
    /** Wave N/O — multi-persona cast + per-scene persona assignment. */
    personas?: { id: string; name?: string; profileId?: string; clone?: string; preset?: { engine: string; voiceId: string }; language?: string; engine?: string; seed?: number }[];
    defaultPersona?: string;
    /** Per-scene persona id (matches personas[].id). Overrides defaultPersona. */
    scenePersonas?: Record<number, string>;
    /** In-scene dialogue per scene index: back-and-forth turns, each spoken
     *  by its own persona voice and concatenated one-by-one. */
    sceneDialogue?: Record<number, { speaker: string; text: string }[]>;
    lowerThird?: string;
    titleCard?: { title: string; subtitle?: string; durationSec?: number };
    endCta?: string;
    watermark?: string;
    fontFamily?: string;
    fontColor?: string;
    fontWeight?: number;
    emojiByScene?: Record<number, string>;
    progressBar?: boolean;
    clipSpeedByScene?: Record<number, number>;
    stabilizeScenes?: number[];
    chromaKeyScenes?: number[];
    filterByScene?: Record<number, 'bw' | 'vintage' | 'sepia'>;
    blurScenes?: number[];
    sceneOrder?: number[];
    deleteScenes?: number[];
    loopVideo?: number;
    beatSync?: boolean;
    exportFormat?: 'mp4' | 'webm' | 'gif';
    posterScene?: number;
    contactSheet?: boolean;
    licenseFilter?: string;
    paletteFilter?: string;
    downloadUrl?: string;
    downloadUrlKind?: 'image' | 'video' | 'music' | 'sfx';
    rerender?: boolean;

    // ═══════════════════════════════════════════════
    //  Advanced Editing Control — Phase 2
    //  Forwarded from agentic-scripts.json for the
    //  compose.ts render path to consume.
    // ═══════════════════════════════════════════════
    duckDepthByScene?: Record<number, number>;
    duckDepth?: number;
    voiceVolumeByScene?: Record<number, number>;
    voiceDelayByScene?: Record<number, number>;
    sceneDurationByScene?: Record<number, number>;
    minSceneDuration?: number;
    maxSceneDuration?: number;
    crossfadeSec?: number;
    colorTempByScene?: Record<number, number>;
    contrastByScene?: Record<number, number>;
    saturationByScene?: Record<number, number>;
    brightnessByScene?: Record<number, number>;
    gammaByScene?: Record<number, number>;
    rotateByScene?: Record<number, number>;
    cropByScene?: Record<number, { x: number; y: number; width: number; height: number }>;
    scaleByScene?: Record<number, { width: number; height: number } | 'fit'>;
    positionByScene?: Record<number, { x: number; y: number }>;
    opacityByScene?: Record<number, number>;
    blendModeByScene?: Record<number, string>;
    mirrorByScene?: Record<number, 'horizontal' | 'vertical' | 'both'>;
    textOverlayByScene?: Record<number, { text: string; x?: string; y?: string; fontSize?: number; color?: string; duration?: number }>;
    imageOverlayByScene?: Record<number, { image: string; x?: string; y?: string; width?: number; height?: number; opacity?: number }>;
    emojiOverlayByScene?: Record<number, { emoji: string; x?: string; y?: string; size?: number }>;
    animatedText?: { text: string; start: number; end: number; x?: string; y?: string; fontSize?: number; color?: string }[];
    ctaButtonByScene?: Record<number, { text: string; x?: string; y?: string; width?: number; height?: number; color?: string; borderColor?: string; borderRadius?: number }>;
    transitionInByScene?: Record<number, string>;
    transitionOutByScene?: Record<number, string>;
    transitionDurationByScene?: Record<number, number>;
    transitionCurve?: string;
    audioFilterByScene?: Record<number, string>;
    eqByScene?: Record<number, { freq: number; gain: number; q: number }[]>;
    compressorByScene?: Record<number, { threshold: number; ratio: number; attack: number; release: number; makeup: number }>;
    noiseReductionByScene?: Record<number, number>;
    reverbByScene?: Record<number, string>;
    pitchShiftByScene?: Record<number, number>;
    tempoByScene?: Record<number, number>;
    lutByScene?: Record<number, string>;
    toneCurveByScene?: Record<number, string>;
    highlightsByScene?: Record<number, number>;
    shadowsByScene?: Record<number, number>;
    whitesByScene?: Record<number, number>;
    blacksByScene?: Record<number, number>;
    colorWheelsByScene?: Record<number, { shadows: string; midtones: string; highlights: string }>;
    zoomByScene?: Record<number, { start: number; end: number }>;
    panByScene?: Record<number, { startX: number; startY: number; endX: number; endY: number }>;
    parallaxDepthByScene?: Record<number, number>;
    particlesByScene?: Record<number, string>;
    exportAspects?: ('9:16' | '16:9' | '1:1' | 'square' | '4K')[];
    outputName?: string;
    outputQuality?: 'low' | 'medium' | 'high' | 'lossless';
    halfResolution?: boolean;
    doubleResolution?: boolean;
    frameRate?: number;
    keyframeInterval?: number;
    hardwareEncode?: boolean;
    watermarkByScene?: Record<number, { image: string; x?: string; y?: string; width?: number; height?: number; opacity?: number; position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' }>;
    watermarkRotation?: number;
    watermarkShadow?: { x: number; y: number; blur: number; color: string };
    brandTintByScene?: Record<number, string>;
    verifyScenes?: boolean;
    verifyFinal?: boolean;
    minConfidence?: number;
    verifyPrompt?: string;
    variants?: number;
    seed?: number;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    retryCount?: number;
    timeoutSec?: number;
    tags?: string[];
    description?: string;
    specVersion?: string;
}
