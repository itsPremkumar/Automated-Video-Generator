/**
 * cli-job.ts — lightweight, dependency-free types + builder for the
 * agentic-scripts.json job format.
 *
 * Kept separate from agentic-cli.ts so the FULL control surface can be
 * unit-tested without pulling in the heavy orchestrator graph (pipeline,
 * render, speech-backend, …). agentic-cli.ts re-exports buildPipelineRequest.
 */
import type { PipelineRequest } from '../../agentic/orchestrator/types.js';
import type { AgenticBackend } from '../../agentic/ai/agent.js';
import type { AgenticConfig } from '../../agentic/config.js';

export interface AgenticCliJob {
    id?: string;
    title: string;
    /** Script with [Visual: ...] and [Text: ...] tags.
     *  When omitted the pipeline auto-generates from title+topic. */
    script?: string;
    /** Fallback topic when no custom script is provided. */
    topic?: string;
    orientation?: 'portrait' | 'landscape' | 'square';
    voice?: string;
    musicQuery?: string;
    /** Opt out of background music (voice-only final). Default: music on. */
    music?: boolean;
    /** Bind files from input/visuals/ to scenes (cycles if fewer than scenes). */
    localAssets?: string[];
    autoLocalAssets?: boolean;
    /** Bind video clips from input/visuals/ to scenes (prefers video). */
    videoClips?: string[];
    /** Per-scene personal audio overrides (files from input/voiceover/). */
    personalAudio?: string[];
    /** Hook-first scene reordering (default: true). */
    hookFirst?: boolean;
    /** Variable pacing (hook 3s, body 5s, breath 5/3s). (default: true). */
    variablePacing?: boolean;
    /** Backend: 'agent' (default) or 'vision'. Sets backend for the agentic pipeline. */
    backend?: AgenticBackend;
    /** Number of stock candidates to fetch per scene (default: 2). */
    candidatesPerAsset?: number;
    /** Language code for voice fallback. */
    language?: string;
    /** Multi-persona voice cast. Each entry resolves to a VoiceBox profile
     *  (existing id, a preset voice, or a real cloned voice from a clip).
     *  Scenes reference a persona by id via `scenePersonas` (per-scene) or the
     *  global `defaultPersona` applies to every scene. Enables two-or-more
     *  distinct voices in one video (e.g. a host + a guest, or a dialogue). */
    personas?: { id: string; name?: string; profileId?: string; clone?: string; preset?: { engine: string; voiceId: string }; language?: string; engine?: string; seed?: number }[];
    /** Persona id applied to all scenes unless a scene overrides it. */
    defaultPersona?: string;
    /** Per-scene persona id keyed by scene index (0-based). Overrides defaultPersona. */
    scenePersonas?: Record<number, string>;
    /** In-scene dialogue per scene index: each entry is a back-and-forth
     *  turn list; turn.speaker is a persona id, turn.text is that speaker's
     *  line. The voice stage speaks each turn with its own persona voice and
     *  concatenates them one-by-one into the scene audio. */
    sceneDialogue?: Record<number, { speaker: string; text: string }[]>;
    /** Filename of a local audio file in input/visuals/ for background music. */
    backgroundMusic?: string;
    /** Volume for background music (0.0–1.0, default ~0.15). */
    musicVolume?: number;
    /** Branded title card at the start. */
    intro?: { title: string; subtitle?: string; durationSec?: number };
    /** Branded CTA card at the end. */
    outro?: { ctaText: string; showSubscribe?: boolean; hashtags?: string[]; durationSec?: number };
    // ═════════════════════════════════════════════════
    //  Extended customization — Phase 1
    // ═════════════════════════════════════════════════
    /** Named caption theme preset. */
    captionTheme?: string;
    /** Caption rendering mode. */
    captions?: 'burned' | 'karaoke' | 'none';
    /** Enable transition sound effects. */
    sfx?: boolean;
    /** J-cut: next voiceover leads picture by N seconds. */
    jCutSec?: number;
    /** Named format preset. */
    format?: string;
    /** Named visual preset. */
    preset?: string;
    /** Override aspect ratio. */
    aspect?: '9:16' | '1:1' | '16:9' | 'square';
    /** Enable/disable vignette (default on). */
    vignette?: boolean;
    /** Enable kinetic lower-third text (default on). */
    kineticText?: boolean;
    /** Music ducking depth. */
    musicIntensity?: 'calm' | 'mid' | 'energetic';
    /** Target platform for auto-tailoring. */
    platform?: 'tiktok' | 'youtube' | 'instagram' | 'reels';
    /** Video content type. */
    videoType?: 'facts' | 'tutorial' | 'news' | 'story' | 'product' | 'motivational' | 'nature';
    /** Branding config. */
    brand?: { watermark?: string; accent?: string };
    /** Render engine. */
    renderer?: 'ffmpeg' | 'remotion';
    /** Retry budget. */
    maxAttempts?: number;
    /** Extra subtitle languages. */
    languages?: string[];
    /** Global Ken Burns toggle. */
    kenBurns?: boolean;
    /** Global transition override. */
    transition?: 'fade' | 'slide' | 'zoomblur' | 'cut';
    /** Global grade override. */
    grade?: string;
    // ═════════════════════════════════════════════════
    //  Control-surface extension — full config reachability
    // ═════════════════════════════════════════════════
    /** OPT-IN AI visual/audio verification (reuses the agent's own model). */
    aiVerify?: AgenticConfig['aiVerify'];
    /** Workspace retention budget (how many workspaces to keep after pruning). */
    pruneWorkspaces?: number;
    /** Model circuit-breaker budget for the agent brain. */
    brain?: { maxCalls?: number; maxFails?: number };
    /** Skip the render step — plan + inspect only. */
    dryRun?: boolean;
    /** Global fallback visual (filename in input/visuals/) when a scene has no visual. */
    defaultVisual?: string;
    /** Per-job agent backend config (model/provider hooks). */
    agent?: Partial<import('../../agentic/ai/agent.js').AgentBackendConfig>;
    // ═════════════════════════════════════════════════
    //  Single-Feature Execution Modes
    //  Each mode runs ONLY the specified stage, skipping all others.
    //  Useful for testing individual pipeline stages in isolation.
    // ═════════════════════════════════════════════════
    /** Run ONLY the plan stage (script → scenes → keywords). No fetch/render. */
    mode?: 'plan' | 'visuals' | 'voice' | 'render' | 'download-images' | 'download-videos' | 'download-music' | 'generate-voice-edgetts' | 'generate-voice-voicebox' | 'clone-voice' | 'full';
    /** When mode='download-images', only download image assets for these scene indices (0-based). */
    sceneIndices?: number[];
    /** When mode='generate-voice-voicebox', use this reference voice clip from input/voices/. */
    voiceReferenceClip?: string;
    /** When mode='clone-voice', clone this person's voice from input/voices/<clip>. */
    cloneVoiceFrom?: string;
    /** When mode='generate-voice-edgetts', use this specific Edge-TTS voice. */
    edgeTtsVoice?: string;
    /** When mode='generate-voice-voicebox', use this Kokoro preset voice. */
    kokoroVoice?: string;
    /** When mode='download-music', only download music tracks (no visuals/voice). */
    downloadMusicOnly?: boolean;
    /** When mode='download-images', only download image assets (no videos/music). */
    downloadImagesOnly?: boolean;
    /** When mode='download-videos', only download video assets (no images/music). */
    downloadVideosOnly?: boolean;
    /** Bulk fetch: when mode='download-images' and this is set, ignore the
     *  script/scenes and download `downloadCount` distinct images of this exact
     *  subject (e.g. "eagle", "mountain sunset"). Enables "download 10 eagle
     *  images" as a single command. */
    searchQuery?: string;
    /** Number of distinct assets to download for a bulk `searchQuery` fetch
     *  (overrides candidatesPerAsset for the bulk path). */
    downloadCount?: number;

    // ═════════════════════════════════════════════════
    //  Advanced Feature Block — ALL OPTIONAL (off by default).
    //  Every field here is a single, independently toggleable editor signal.
    //  Omitting any of them leaves the matching feature disabled, so a job
    //  that doesn't set them behaves exactly as before.
    // ═════════════════════════════════════════════════

    // ── Sound Design ──
    /** Per-scene SFX: map scene index → sfx query (e.g. {"0":"whoosh","2":"click"}). */
    sfxByScene?: Record<number, string>;
    /** Whoosh on every scene cut. */
    sfxOnCut?: boolean;
    /** Normalize loudness to target LUFS (e.g. -14). Off when undefined. */
    normalizeLufs?: number;
    /** Loop background music to fill the whole video instead of trimming once. */
    loopMusic?: boolean;

    // ── Voice Intelligence ──
    /** Edge-TTS style tag (e.g. 'cheerful', 'whispering', 'angry'). */
    ttsStyle?: string;
    /** Per-scene voice overrides as map: {"0":"en-US-AriaNeural","1":"en-US-GuyNeural"}. */
    voicesByScene?: Record<number, string>;
    /** Speed multiplier for voice (0.5–2.0). 1 = normal. */
    voiceSpeed?: number;
    /** Pitch shift in semitones (Voicebox/Kokoro path only). */
    voicePitchSemitones?: number;
    /** Voice-aging preset: 'younger' (+4 semitones) | 'older' (-4 semitones). */
    voiceAging?: 'younger' | 'older';
    /** Dub/translate the script into this language code (e.g. 'hi','ta'). */
    dubLanguage?: string;
    /** Use a cloned-voice profile id saved earlier to narrate this render. */
    useClonedVoiceId?: string;
    /** Multi-speaker dialogue: assign alternating scenes to two voices. */
    dialogueVoices?: [string, string];

    // ── Typography / Overlays ──
    /** Lower-third name tag shown on scene 1 (e.g. "John — Expert"). */
    lowerThird?: string;
    /** Title card at the head (separate from `intro`). */
    titleCard?: { title: string; subtitle?: string; durationSec?: number };
    /** End-screen CTA text. */
    endCta?: string;
    /** Path to a logo/watermark image in input/visuals/ (pinned bottom-right). */
    watermark?: string;
    /** Caption/title font family. */
    fontFamily?: string;
    /** Caption/title font color (CSS color). */
    fontColor?: string;
    /** Caption/title font weight. */
    fontWeight?: number;
    /** Emoji/sticker overlay per scene (map scene index → emoji). */
    emojiByScene?: Record<number, string>;
    /** Animated progress bar that grows left→right over the clip. */
    progressBar?: boolean;

    // ── Visual Effects (per-clip / per-scene) ──
    /** Playback speed multiplier for visuals (scene index → multiplier). */
    clipSpeedByScene?: Record<number, number>;
    /** Stabilize shaky footage for listed scene indices. */
    stabilizeScenes?: number[];
    /** Chroma-key (green-screen) removal for listed scene indices. */
    chromaKeyScenes?: number[];
    /** Filter preset applied to scenes: 'bw' | 'vintage' | 'sepia'. */
    filterByScene?: Record<number, 'bw' | 'vintage' | 'sepia'>;
    /** Background blur for depth on listed scene indices. */
    blurScenes?: number[];
    /** Ken Burns zoom/pan for listed scene indices (or global kenBurns). */

    // ── Structure / Pacing ──
    /** Reorder scenes: explicit 0-based order array, e.g. [2,0,1]. */
    sceneOrder?: number[];
    /** Delete these scene indices (0-based) before render. */
    deleteScenes?: number[];
    /** Loop the entire assembled video N times. */
    loopVideo?: number;
    /** Beat-sync scene cuts to the chosen music (requires a music track). */
    beatSync?: boolean;

    // ── Output / Export ──
    /** Export format override: 'mp4' | 'webm' | 'gif'. */
    exportFormat?: 'mp4' | 'webm' | 'gif';
    /** Render a standalone poster/thumbnail from this scene index. */
    posterScene?: number;
    /** Also export a contact-sheet grid of all scenes. */
    contactSheet?: boolean;

    // ── Acquisition Filtering ──
    /** License filter for bulk image/video fetch (e.g. 'cc0', 'public'). */
    licenseFilter?: string;
    /** Dominant color filter for bulk image fetch (CSS color hint). */
    paletteFilter?: string;
    /** Direct download of an explicit asset URL (image/video/music). */
    downloadUrl?: string;
    /** Kind of direct download. */
    downloadUrlKind?: 'image' | 'video' | 'music' | 'sfx';

    // ── Iterative Orchestration ──
    /** Re-render using cached assets only (skip acquire + voice). */
    rerender?: boolean;

    // ═════════════════════════════════════════════════
    //  Advanced Editing Control — Phase 2
    //  High-level, declarative video editing signals that
    //  compose.ts bakes into the final render via ffmpeg.
    //  All optional, off by default — backward compatible.
    // ═════════════════════════════════════════════════

    // ── Audio Ducking & Mixing ──
    /** Per-scene music ducking depth override (0.0–1.0). When set, the
     *  music volume drops to this level during speech in that scene. */
    duckDepthByScene?: Record<number, number>;
    /** Global ducking depth (0.0–1.0) when musicIntensity is not enough. */
    duckDepth?: number;
    /** Per-scene voice volume override (0.0–1.0) for balancing narration
     *  against music/SFX. */
    voiceVolumeByScene?: Record<number, number>;
    /** Delay (seconds) before voice starts in each scene (for precise
     *  lip-sync with stock footage). */
    voiceDelayByScene?: Record<number, number>;

    // ── Scene Timing & Pacing ──
    /** Per-scene hold duration override (seconds). When set, overrides the
     *  auto-calculated duration from voiceover length. */
    sceneDurationByScene?: Record<number, number>;
    /** Minimum scene duration (seconds). Scenes shorter than this are padded. */
    minSceneDuration?: number;
    /** Maximum scene duration (seconds). Scenes longer than this are trimmed. */
    maxSceneDuration?: number;
    /** Global crossfade duration between scenes (seconds). Default 0.4. */
    crossfadeSec?: number;

    // ── Visual Effects (Advanced) ──
    /** Per-scene color temperature (Kelvin). Warmer = lower K, cooler = higher K. */
    colorTempByScene?: Record<number, number>;
    /** Per-scene contrast adjustment (-1.0 to 2.0, default 1.0). */
    contrastByScene?: Record<number, number>;
    /** Per-scene saturation adjustment (0.0 to 3.0, default 1.0). */
    saturationByScene?: Record<number, number>;
    /** Per-scene brightness adjustment (-1.0 to 1.0, default 0.0). */
    brightnessByScene?: Record<number, number>;
    /** Per-scene gamma adjustment (0.1 to 3.0, default 1.0). */
    gammaByScene?: Record<number, number>;
    /** Per-scene rotation (degrees). 90/180/270 for standard, arbitrary for custom. */
    rotateByScene?: Record<number, number>;
    /** Per-scene crop box: {x, y, width, height} in pixels. */
    cropByScene?: Record<number, { x: number; y: number; width: number; height: number }>;
    /** Per-scene scale override: {width, height} or "fit" to maintain aspect. */
    scaleByScene?: Record<number, { width: number; height: number } | 'fit'>;
    /** Per-scene position offset: {x, y} in pixels (for compositing). */
    positionByScene?: Record<number, { x: number; y: number }>;
    /** Per-scene opacity (0.0–1.0) for overlay/transparency effects. */
    opacityByScene?: Record<number, number>;
    /** Per-scene blend mode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'softlight'. */
    blendModeByScene?: Record<number, string>;
    /** Per-scene mirror/flip: 'horizontal' | 'vertical' | 'both'. */
    mirrorByScene?: Record<number, 'horizontal' | 'vertical' | 'both'>;

    // ── Overlay & Text (Advanced) ──
    /** Per-scene text overlay: {text, x, y, fontSize, color, duration}. */
    textOverlayByScene?: Record<number, { text: string; x?: string; y?: string; fontSize?: number; color?: string; duration?: number }>;
    /** Per-scene image overlay: {image, x, y, width, height, opacity}. */
    imageOverlayByScene?: Record<number, { image: string; x?: string; y?: string; width?: number; height?: number; opacity?: number }>;
    /** Per-scene emoji overlay with custom position and size. */
    emojiOverlayByScene?: Record<number, { emoji: string; x?: string; y?: string; size?: number }>;
    /** Animated text sequence: array of {text, start, end} for kinetic reveals. */
    animatedText?: { text: string; start: number; end: number; x?: string; y?: string; fontSize?: number; color?: string }[];
    /** Per-scene CTA button: {text, x, y, width, height, color, borderColor, borderRadius}. */
    ctaButtonByScene?: Record<number, { text: string; x?: string; y?: string; width?: number; height?: number; color?: string; borderColor?: string; borderRadius?: number }>;

    // ── Transitions (Advanced) ──
    /** Per-scene transition IN type: 'fade' | 'slide' | 'zoomblur' | 'cut' | 'push' | 'wipe' | 'cube'. */
    transitionInByScene?: Record<number, string>;
    /** Per-scene transition OUT type. */
    transitionOutByScene?: Record<number, string>;
    /** Per-scene transition duration (seconds). */
    transitionDurationByScene?: Record<number, number>;
    /** Custom transition curve: 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear'. */
    transitionCurve?: string;

    // ── Audio Effects ──
    /** Per-scene audio filter: 'bass_boost' | 'treble_boost' | 'noise_reduction' | 'compressor' | 'eq'. */
    audioFilterByScene?: Record<number, string>;
    /** Per-scene EQ bands: [{freq, gain, q}] for parametric EQ. */
    eqByScene?: Record<number, { freq: number; gain: number; q: number }[]>;
    /** Per-scene compressor settings: {threshold, ratio, attack, release, makeup}. */
    compressorByScene?: Record<number, { threshold: number; ratio: number; attack: number; release: number; makeup: number }>;
    /** Per-scene noise reduction strength (0.0–1.0). */
    noiseReductionByScene?: Record<number, number>;
    /** Per-scene reverb: 'small_room' | 'medium_room' | 'large_hall' | 'cathedral' | 'plate'. */
    reverbByScene?: Record<number, string>;
    /** Per-scene pitch shift in semitones (independent of voicePitchSemitones). */
    pitchShiftByScene?: Record<number, number>;
    /** Per-scene audio tempo (independent of voiceSpeed). */
    tempoByScene?: Record<number, number>;

    // ── Color Grading (Advanced) ──
    /** Per-scene LUT (Look-Up Table) filename in input/visuals/. */
    lutByScene?: Record<number, string>;
    /** Per-scene tone curve: 'linear' | 's-curve' | 'reverse-s' | 'high-contrast' | 'low-contrast'. */
    toneCurveByScene?: Record<number, string>;
    /** Per-scene highlights recovery (0.0–1.0). */
    highlightsByScene?: Record<number, number>;
    /** Per-scene shadows lift (0.0–1.0). */
    shadowsByScene?: Record<number, number>;
    /** Per-scene whites clip point (0.0–1.0). */
    whitesByScene?: Record<number, number>;
    /** Per-scene blacks clip point (0.0–1.0). */
    blacksByScene?: Record<number, number>;
    /** Per-scene color wheels: {shadows, midtones, highlights} as RGB hex. */
    colorWheelsByScene?: Record<number, { shadows: string; midtones: string; highlights: string }>;

    // ── Motion Graphics ──
    /** Per-scene animated zoom: {start, end} as multipliers (e.g. {1.0, 1.5}). */
    zoomByScene?: Record<number, { start: number; end: number }>;
    /** Per-scene pan: {startX, startY, endX, endY} as percentages (0–100). */
    panByScene?: Record<number, { startX: number; startY: number; endX: number; endY: number }>;
    /** Per-scene parallax depth (0–10) for 2.5D effect. */
    parallaxDepthByScene?: Record<number, number>;
    /** Per-scene particle effect: 'snow' | 'sparkles' | 'rain' | 'fireflies'. */
    particlesByScene?: Record<number, string>;

    // ── Output Control ──
    /** Render multiple aspect ratios in one pass: ['9:16', '16:9', '1:1']. */
    exportAspects?: ('9:16' | '16:9' | '1:1' | 'square' | '4K')[];
    /** Custom output filename (without extension). */
    outputName?: string;
    /** Output quality: 'low' | 'medium' | 'high' | 'lossless'. */
    outputQuality?: 'low' | 'medium' | 'high' | 'lossless';
    /** Render at half resolution for faster previews. */
    halfResolution?: boolean;
    /** Render at double resolution for high-DPI output. */
    doubleResolution?: boolean;
    /** Frame rate override (default 25). */
    frameRate?: number;
    /** Keyframe interval (seconds). Lower = better seeking, larger files. */
    keyframeInterval?: number;
    /** Enable hardware encoding (h264_nvenc on NVIDIA, h264_videotoolbox on Apple). */
    hardwareEncode?: boolean;

    // ── Watermark & Branding (Advanced) ──
    /** Per-scene watermark: {image, x, y, width, height, opacity, position}. */
    watermarkByScene?: Record<number, { image: string; x?: string; y?: string; width?: number; height?: number; opacity?: number; position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' }>;
    /** Watermark rotation (degrees). */
    watermarkRotation?: number;
    /** Watermark drop shadow: {x, y, blur, color}. */
    watermarkShadow?: { x: number; y: number; blur: number; color: string };
    /** Per-scene brand color tint (hex) applied as an overlay. */
    brandTintByScene?: Record<number, string>;

    // ── AI Verification (Advanced) ──
    /** Verify each scene's visual matches its keywords (opt-in AI check). */
    verifyScenes?: boolean;
    /** Verify final render matches the script's intent (opt-in AI check). */
    verifyFinal?: boolean;
    /** Minimum AI confidence threshold (0–10) for asset approval. */
    minConfidence?: number;
    /** Custom verification prompt for the AI model. */
    verifyPrompt?: string;

    // ── Batch & Automation ──
    /** Generate N variants of this job with different random seeds. */
    variants?: number;
    /** Random seed for reproducible variant generation. */
    seed?: number;
    /** Priority for batch scheduling: 'low' | 'normal' | 'high' | 'urgent'. */
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    /** Auto-retry failed jobs N times. */
    retryCount?: number;
    /** Timeout (seconds) for this job's render. */
    timeoutSec?: number;
    /** Tags for organizing jobs (e.g. ["tiktok", "cinematic", "waveA"]). */
    tags?: string[];
    /** Description for documentation/organization. */
    description?: string;
    /** Version of the job spec format (for migration). */
    specVersion?: string;
}

/**
 * Build a PipelineRequest from a single job entry in agentic-scripts.json.
 * Pure function — no pipeline, no network. Every field the script JSON can
 * express is forwarded here, including the control-surface extension.
 */
export function buildPipelineRequest(job: AgenticCliJob, id: string, topic: string): PipelineRequest {
    return {
        script: job.script,
        topic,
        title: job.title || topic,
        jobId: id,
        orientation: job.orientation ?? 'portrait',
        voice: job.voice,
        musicQuery: job.musicQuery,
        music: job.music,
        localAssets: job.localAssets,
        autoLocalAssets: job.autoLocalAssets,
        videoClips: job.videoClips,
        personalAudio: job.personalAudio,
        hookFirst: job.hookFirst ?? true,
        variablePacing: job.variablePacing ?? true,
        backend: job.backend ?? 'agent',
        candidatesPerAsset: job.candidatesPerAsset ?? 2,
        language: job.language,
        backgroundMusic: job.backgroundMusic,
        musicVolume: job.musicVolume,
        intro: job.intro,
        outro: job.outro,
        // Phase 1 — extended
        captionTheme: job.captionTheme,
        captions: job.captions,
        sfx: job.sfx,
        jCutSec: job.jCutSec,
        format: job.format,
        preset: job.preset,
        aspect: job.aspect,
        vignette: job.vignette,
        kineticText: job.kineticText,
        musicIntensity: job.musicIntensity,
        platform: job.platform,
        videoType: job.videoType,
        brand: job.brand,
        renderer: job.renderer,
        maxAttempts: job.maxAttempts,
        languages: job.languages,
        kenBurns: job.kenBurns,
        transition: job.transition,
        grade: job.grade,
        // Control-surface extension — full config reachability from the script JSON
        aiVerify: job.aiVerify,
        pruneWorkspaces: job.pruneWorkspaces,
        brain: job.brain,
        dryRun: job.dryRun,
        defaultVisual: job.defaultVisual,
        agent: job.agent,
        // Advanced Feature Block — forwarded verbatim for the Remotion path
        sfxByScene: job.sfxByScene,
        sfxOnCut: job.sfxOnCut,
        normalizeLufs: job.normalizeLufs,
        loopMusic: job.loopMusic,
        ttsStyle: job.ttsStyle,
        voicesByScene: job.voicesByScene,
        voiceSpeed: job.voiceSpeed,
        voicePitchSemitones: job.voicePitchSemitones,
        voiceAging: job.voiceAging,
        dubLanguage: job.dubLanguage,
        useClonedVoiceId: job.useClonedVoiceId,
        dialogueVoices: job.dialogueVoices,
        lowerThird: job.lowerThird,
        titleCard: job.titleCard,
        endCta: job.endCta,
        watermark: job.watermark,
        fontFamily: job.fontFamily,
        fontColor: job.fontColor,
        fontWeight: job.fontWeight,
        emojiByScene: job.emojiByScene,
        progressBar: job.progressBar,
        clipSpeedByScene: job.clipSpeedByScene,
        stabilizeScenes: job.stabilizeScenes,
        chromaKeyScenes: job.chromaKeyScenes,
        filterByScene: job.filterByScene,
        blurScenes: job.blurScenes,
        sceneOrder: job.sceneOrder,
        deleteScenes: job.deleteScenes,
        loopVideo: job.loopVideo,
        beatSync: job.beatSync,
        exportFormat: job.exportFormat,
        posterScene: job.posterScene,
        contactSheet: job.contactSheet,
        licenseFilter: job.licenseFilter,
        paletteFilter: job.paletteFilter,
        downloadUrl: job.downloadUrl,
        downloadUrlKind: job.downloadUrlKind,
        rerender: job.rerender,
        // Wave N/O — multi-persona + dialogue voice control
        personas: job.personas,
        defaultPersona: job.defaultPersona,
        scenePersonas: job.scenePersonas,
        // Phase 2 — Advanced Editing Control
        duckDepthByScene: job.duckDepthByScene,
        duckDepth: job.duckDepth,
        voiceVolumeByScene: job.voiceVolumeByScene,
        voiceDelayByScene: job.voiceDelayByScene,
        sceneDurationByScene: job.sceneDurationByScene,
        minSceneDuration: job.minSceneDuration,
        maxSceneDuration: job.maxSceneDuration,
        crossfadeSec: job.crossfadeSec,
        colorTempByScene: job.colorTempByScene,
        contrastByScene: job.contrastByScene,
        saturationByScene: job.saturationByScene,
        brightnessByScene: job.brightnessByScene,
        gammaByScene: job.gammaByScene,
        rotateByScene: job.rotateByScene,
        cropByScene: job.cropByScene,
        scaleByScene: job.scaleByScene,
        positionByScene: job.positionByScene,
        opacityByScene: job.opacityByScene,
        blendModeByScene: job.blendModeByScene,
        mirrorByScene: job.mirrorByScene,
        textOverlayByScene: job.textOverlayByScene,
        imageOverlayByScene: job.imageOverlayByScene,
        emojiOverlayByScene: job.emojiOverlayByScene,
        animatedText: job.animatedText,
        ctaButtonByScene: job.ctaButtonByScene,
        transitionInByScene: job.transitionInByScene,
        transitionOutByScene: job.transitionOutByScene,
        transitionDurationByScene: job.transitionDurationByScene,
        transitionCurve: job.transitionCurve,
        audioFilterByScene: job.audioFilterByScene,
        eqByScene: job.eqByScene,
        compressorByScene: job.compressorByScene,
        noiseReductionByScene: job.noiseReductionByScene,
        reverbByScene: job.reverbByScene,
        pitchShiftByScene: job.pitchShiftByScene,
        tempoByScene: job.tempoByScene,
        lutByScene: job.lutByScene,
        toneCurveByScene: job.toneCurveByScene,
        highlightsByScene: job.highlightsByScene,
        shadowsByScene: job.shadowsByScene,
        whitesByScene: job.whitesByScene,
        blacksByScene: job.blacksByScene,
        colorWheelsByScene: job.colorWheelsByScene,
        zoomByScene: job.zoomByScene,
        panByScene: job.panByScene,
        parallaxDepthByScene: job.parallaxDepthByScene,
        particlesByScene: job.particlesByScene,
        exportAspects: job.exportAspects,
        outputName: job.outputName,
        outputQuality: job.outputQuality,
        halfResolution: job.halfResolution,
        doubleResolution: job.doubleResolution,
        frameRate: job.frameRate,
        keyframeInterval: job.keyframeInterval,
        hardwareEncode: job.hardwareEncode,
        watermarkByScene: job.watermarkByScene,
        watermarkRotation: job.watermarkRotation,
        watermarkShadow: job.watermarkShadow,
        brandTintByScene: job.brandTintByScene,
        verifyScenes: job.verifyScenes,
        verifyFinal: job.verifyFinal,
        minConfidence: job.minConfidence,
        verifyPrompt: job.verifyPrompt,
        variants: job.variants,
        seed: job.seed,
        priority: job.priority,
        retryCount: job.retryCount,
        timeoutSec: job.timeoutSec,
        tags: job.tags,
        description: job.description,
        specVersion: job.specVersion,
    };
}
