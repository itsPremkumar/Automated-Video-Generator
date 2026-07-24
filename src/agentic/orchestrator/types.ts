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
    candidatesPerAsset?: number;
    backend?: AgenticBackend;
    preferVisual?: 'image' | 'video';
    agent?: Partial<AgentBackendConfig>;
    dryRun?: boolean;
    localAssets?: string[];
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
}
