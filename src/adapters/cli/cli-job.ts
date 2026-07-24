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
    };
}
