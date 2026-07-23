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
    orientation?: 'portrait' | 'landscape';
    voice?: string;
    musicQuery?: string;
    /** Bind files from input/visuals/ to scenes (cycles if fewer than scenes). */
    localAssets?: string[];
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
    aspect?: '9:16' | '1:1' | '16:9';
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
    transition?: string;
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
        localAssets: job.localAssets,
        videoClips: job.videoClips,
        personalAudio: job.personalAudio,
        hookFirst: job.hookFirst ?? true,
        variablePacing: job.variablePacing ?? true,
        backend: job.backend ?? 'agent',
        candidatesPerAsset: job.candidatesPerAsset ?? 4,
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
    };
}
