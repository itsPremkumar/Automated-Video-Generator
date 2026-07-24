/**
 * Shared types for the agentic video pipeline.
 *
 * These describe the data that flows between the six stages:
 *   Plan -> Acquire -> Verify -> Decide (gateway) -> Gate -> Render
 *
 * Everything is plain, JSON-serialisable data so an agent (or a human) can
 * inspect and edit it. No behavior is hidden.
 */

export type AssetKind = 'image' | 'video' | 'music';

export type AutonomyLevel = 'L0-manual' | 'L1-suggest' | 'L2-autonomous' | 'L3-self-improving';

export type Decision = 'approved' | 'rejected' | 'pending' | 'fallback';

export interface ScenePlan {
    sceneNumber: number;
    voiceoverText: string;
    /** Localized caption text (e.g. translated to the target voice language).
     *  When set, the renderer burns THIS instead of voiceoverText so on-screen
     *  captions match a non-English voiceover. Falls back to voiceoverText. */
    captionText?: string;
    /** Keywords used to fetch candidate visuals for this scene. */
    searchKeywords: string[];
    /** 'image' = prefer a still; 'video' = prefer motion. */
    visualPreference: 'image' | 'video';
    durationSec: number;
    /** User-supplied local media file (from input/visuals/) bound to this
     *  scene. When set, the acquire stage uses this file directly instead of
     *  fetching stock (legacy localAsset behaviour, ported to agentic). */
    localAsset?: string;
    /** User-supplied voiceover audio file bound to this scene (C2). When set,
     *  the pipeline uses it directly instead of generating TTS for the scene. */
    personalAudio?: string;
    /** Override transition type for this scene ('fade' | 'slide' | 'zoomblur' | 'cut'). */
    transition?: string;
    /** Override color grade for this scene ('neutral' | 'warm' | 'cool' | 'cinematic' | 'vivid'). */
    grade?: string;
    /** Disable Ken Burns for this specific scene (false = no zoompan). */
    kenBurns?: boolean;
    /** Trim start time for local video asset (seconds). */
    trimStart?: number;
    /** Trim end time for local video asset (seconds). */
    trimEnd?: number;
    /** Caption position style ('top' | 'bottom' | 'center'). */
    captionStyle?: string;
    /** Caption text color (e.g. 'white', 'yellow'). */
    captionColor?: string;
    /** Audio fade-in duration in seconds. */
    fadeIn?: number;
    /** Audio fade-out duration in seconds. */
    fadeOut?: number;
    /** Per-scene voice override (e.g. 'en-US-GuyNeural'). Also accepts a
     *  VoiceBox profile id (for cloned/preset personas) when the agentic
     *  voice stage drives the in-repo speech backend. */ 
    voiceOverride?: string;
    /** Reference to a persona declared in Plan.personas (id). When set, this
     *  scene's voiceover is spoken by that persona's resolved VoiceBox
     *  profile. Takes precedence over the global/default voice. */
    voicePersona?: string;
    /** In-scene dialogue: two (or more) speakers talking one-by-one within a
     *  single scene. Each turn is spoken by its own persona (cloned/preset
     *  voice) and the turns are concatenated into one scene audio track.
     *  When present, it overrides `voiceoverText` for that scene. */
    dialogue?: { speaker: string; text: string }[];
    /** Per-scene background music file name (in input/visuals/). */
    musicOverride?: string;
    /** Per-scene audio volume (0.0–1.0). */
    volumeOverride?: number;
    /** Per-scene caption theme preset (e.g. 'minimal', 'cinematic', 'neon'). */
    captionTheme?: string;
    /** Enable transition sound effects for this scene. */
    sfx?: boolean;
    /** J-cut for this scene: next scene's voiceover leads picture by N seconds. */
    jCutSec?: number;
    /** Enable cinematic vignette for this scene. */
    vignette?: boolean;
    /** Enable animated kinetic lower-third text for this scene. */
    kineticText?: boolean;
    /** Background music ducking depth for this scene. */
    musicIntensity?: 'calm' | 'mid' | 'energetic';
}

export interface Plan {
    jobId: string;
    title: string;
    orientation: 'portrait' | 'landscape' | 'square';
    voice: string;
    musicQuery: string;
    scenes: ScenePlan[];
    totalDurationSec: number;
    /** Multi-persona voice cast. Each entry resolves (by the agentic voice
     *  stage) to a VoiceBox profile id — either an existing profile, a preset
     *  (kokoro/chatterbox) voice, or a real cloned voice from a reference clip.
     *  Scenes reference a persona by id via ScenePlan.voicePersona. */
    personas?: PersonaSpec[];
}

/**
 * A named voice persona the agent fully controls.
 *  - profileId: reuse an already-existing VoiceBox profile (id or name).
 *  - clone: path to a reference audio clip (input/voices/*.wav) → auto-clone a
 *    real voice profile (cached per clip so re-runs reuse it).
 *  - preset: a built-in TTS voice { engine, voiceId } (e.g. kokoro 'af_heart').
 *  - language/engine/seed: optional per-persona overrides.
 */
export interface PersonaSpec {
    id: string;
    name?: string;
    profileId?: string;
    clone?: string;
    preset?: { engine: string; voiceId: string };
    language?: string;
    engine?: string;
    seed?: number;
}

export interface AssetCandidate {
    kind: AssetKind;
    /** Scene index this asset belongs to (music uses -1). */
    sceneIndex: number;
    candidateIndex: number;
    localPath: string;
    url: string;
    source: string;
    license?: string;
    licenseUrl?: string;
    /** Keywords this asset was fetched to satisfy (for verification). */
    keywords: string[];
}

export interface AssetVerification {
    assetId: string;
    kind: AssetKind;
    sceneIndex: number;
    passes: boolean;
    confidence: number; // 0-10
    reason: string;
    metrics?: Record<string, unknown>;
}

export interface AssetDecision {
    assetId: string;
    kind: AssetKind;
    sceneIndex: number;
    decision: Decision;
    rationale: string;
    decidedBy: 'agent' | 'human' | 'system';
    fallbackUsed: boolean;
}

export interface RenderManifestEntry {
    kind: AssetKind;
    sceneIndex: number;
    localPath: string;
    license?: string;
    licenseUrl?: string;
    /** Per-scene spoken voiceover (Phase 2). Present for image/video scenes. */
    audioPath?: string;
    /** Scene duration in seconds (driven by voiceover length when available). */
    durationSec?: number;
    /** Word-timed caption cues (Phase 4.2). */
    captionSegments?: { text: string; startMs: number; endMs: number }[];
}

export interface RenderManifest {
    jobId: string;
    title: string;
    orientation: 'portrait' | 'landscape' | 'square';
    voice: string;
    musicQuery: string;
    assets: RenderManifestEntry[];
    /** True when real TTS produced the voiceover (false = agent tone fallback). */
    voiceoverDriven?: boolean;
    generatedAt: string;
}

export function assetId(kind: AssetKind, sceneIndex: number, candidateIndex: number): string {
    return `${kind}_s${sceneIndex}_c${candidateIndex}`;
}

export interface PipelineResult {
    backend: import('./ai/agent.js').AgenticBackend;
    plan: Plan;
    workspace: import('./management/workspace.js').AgenticWorkspace;
    candidates: AssetCandidate[];
    decisions: AssetDecision[];
    gate: { pass: boolean; checks: { id: string; pass: boolean; label: string; detail: string }[] };
    manifest: RenderManifest;
    voiceovers: import('./media/tts.js').VoiceoverResult | null;
    fullyAgentDriven: boolean;
    postRender?: import('./pipeline/gate.js').PostRenderCheck;
    aiVerify?: import('./config.js').AgenticConfig['aiVerify'];
}

export interface PipelineProgress {
    stage: 'plan' | 'acquire' | 'verify' | 'decide' | 'gate' | 'voiceover' | 'render';
    percent: number;
    message: string;
    sceneIndex?: number;
    candidateIndex?: number;
}
