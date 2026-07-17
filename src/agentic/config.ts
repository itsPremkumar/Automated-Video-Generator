/**
 * config.ts — the FULL customization surface for the agentic video system.
 *
 * The user said "fully control customize everything". This schema is that
 * surface: one typed object drives style, audio, captions, sourcing, and the
 * self-heal budget. It can be authored as JSON/YAML (loaded from a file or
 * env), or assembled from CLI flags. Defaults = the battle-tested "cinematic"
 * preset so the system still works with zero config.
 *
 * Nothing here talks to a network or an AI key — it only parameterizes the
 * deterministic agentic backend.
 */

export type Orientation = 'portrait' | 'landscape';
export type AspectKind = '9:16' | '1:1' | '16:9';
export type TransitionPref = 'fade' | 'slide' | 'zoomblur' | 'cut' | 'mixed';
export type GradePref = 'cinematic' | 'warm' | 'cool' | 'vivid' | 'neutral';
export type CaptionStyle = 'burned' | 'none' | 'karaoke';
export type VideoType = 'facts' | 'tutorial' | 'news' | 'story' | 'product' | 'motivational' | 'nature';
export type MusicIntensity = 'calm' | 'mid' | 'energetic';

/**
 * Video-type templates — each is a partial AgenticConfig that gives a
 * "different perspective" per genre. The user wanted "all types of video in
 * different perspective"; this is the knob that selects the editorial voice.
 * A template is applied ON TOP of the preset (so preset sets the baseline look,
 * template tunes it for the genre), then explicit user overrides win last.
 */
export const VIDEO_TYPE_PROFILES: Record<VideoType, Partial<AgenticConfig>> = {
    facts:        { kineticText: true, transition: 'fade', grade: 'cinematic', musicIntensity: 'mid', captions: 'burned' },
    tutorial:     { kineticText: true, transition: 'slide', grade: 'neutral', musicIntensity: 'calm', captions: 'burned', sfx: true },
    news:         { kineticText: false, transition: 'cut', grade: 'cool', musicIntensity: 'mid', captions: 'burned', orientation: 'landscape', aspect: '16:9' },
    story:        { kineticText: true, transition: 'fade', grade: 'warm', musicIntensity: 'calm', captions: 'burned' },
    product:      { kineticText: true, transition: 'slide', grade: 'vivid', musicIntensity: 'energetic', captions: 'burned', sfx: true },
    motivational: { kineticText: true, transition: 'zoomblur', grade: 'cinematic', musicIntensity: 'energetic', captions: 'karaoke' },
    nature:       { kineticText: false, transition: 'fade', grade: 'cinematic', musicIntensity: 'calm', captions: 'burned' },
};

export interface AgenticConfig {
    /** Topic + title are the only REQUIRED inputs — everything else is optional. */
    topic: string;
    title?: string;

    /** ── Visual style ── */
    preset?: string;                 // named preset id (cinematic|reels|documentary|...)
    orientation?: Orientation;       // portrait (default) | landscape
    aspect?: AspectKind;             // 9:16 | 1:1 | 16:9
    transition?: TransitionPref;     // override per-scene transitions
    grade?: GradePref;               // override per-scene color grade
    kineticText?: boolean;           // animated lower-third / word-pop (default true)
    kenBurns?: boolean;              // gentle zoom on images (default true)
    vignette?: boolean;              // cinematic edge darkening (default true)

    /** ── Audio ── */
    sfx?: boolean;                   // emphasis sound effects on transitions (default false)
    musicQuery?: string;             // free-music search term
    musicIntensity?: 'calm' | 'mid' | 'energetic'; // ducking depth
    voice?: string;                  // TTS voice hint

    /** ── Captions ── */
    captions?: CaptionStyle;         // burned (default) | none | karaoke

    /** ── Sourcing ── */
    preferVisual?: 'image' | 'video';
    candidatesPerAsset?: number;     // assets fetched per scene (default 4)
    videoType?: VideoType;           // template selector (Phase: templates)
    /** Use the user's OWN media from input/input-assets/ instead of (or in
     *  addition to) fetched stock. Files are distributed round-robin across
     *  scenes; any scene without a matching local file falls back to fetching. */
    localAssets?: string[];
    /** A user-supplied default image/video (in input/input-assets/) used as a
     *  last-resort visual when both fetch and the pool fail (legacy-style
     *  default.mp4 fallback). */
    defaultVisual?: string;

    /** ── Pro-edit (human-feel) toggles ── */
    /** Lead with the most intriguing scene instead of a flat list order. */
    hookFirst?: boolean;
    /** Alternate scene durations so the rhythm breathes (uniform = templated). */
    variablePacing?: boolean;
    /** Branded intro title card (cold-open). */
    intro?: { title: string; subtitle?: string; durationSec?: number };
    /** Branded outro CTA card. */
    outro?: { ctaText: string; showSubscribe?: boolean; hashtags?: string[]; durationSec?: number };
    /** J-cut: next scene's voiceover leads its picture by this many seconds
     *  (audio cuts early, picture follows) — the #1 "human editor" tell. */
    jCutSec?: number;

    /** ── Self-heal / automation ── */
    backend?: 'agent' | 'vision';
    maxAttempts?: number;            // autopilot retry budget (default 3)
    renderer?: 'ffmpeg' | 'remotion';
    pruneWorkspaces?: number;        // keep N workspaces (default 2)

    /** ── Branding (optional) ── */
    brand?: { watermark?: string; accent?: string };
}

/** Built-in presets — each is a partial AgenticConfig the user can extend. */
export const PRESETS: Record<string, Partial<AgenticConfig>> = {
    cinematic: {
        orientation: 'portrait', aspect: '9:16', transition: 'fade', grade: 'cinematic',
        kineticText: true, kenBurns: true, vignette: true, captions: 'burned', musicIntensity: 'mid',
    },
    reels: {
        orientation: 'portrait', aspect: '9:16', transition: 'slide', grade: 'vivid',
        kineticText: true, kenBurns: true, vignette: false, captions: 'burned', musicIntensity: 'energetic',
    },
    documentary: {
        orientation: 'landscape', aspect: '16:9', transition: 'fade', grade: 'neutral',
        kineticText: false, kenBurns: true, vignette: true, captions: 'burned', musicIntensity: 'calm',
    },
    'documentary-cool': {
        orientation: 'landscape', aspect: '16:9', transition: 'fade', grade: 'cool',
        kineticText: false, kenBurns: true, vignette: true, captions: 'burned', musicIntensity: 'calm',
    },
    neutral: {
        orientation: 'portrait', aspect: '9:16', transition: 'fade', grade: 'neutral',
        kineticText: true, kenBurns: false, vignette: false, captions: 'burned', musicIntensity: 'mid',
    },
};

/**
 * Resolve a user config into a fully-populated config by applying the named
 * preset first, then user overrides. Returns a normalized config where every
 * production knob has a concrete value.
 */
export function resolveConfig(input: Partial<AgenticConfig>): AgenticConfig {
    const preset = input.preset ? PRESETS[input.preset] ?? {} : PRESETS.cinematic;
    const tpl = input.videoType ? VIDEO_TYPE_PROFILES[input.videoType] ?? {} : {};
    const merged: AgenticConfig = {
        topic: input.topic ?? 'untitled',
        title: input.title ?? input.topic ?? 'untitled',
        ...preset,    // baseline look
        ...tpl,       // genre voice (on top of preset)
        ...stripUndefined(input), // explicit user overrides win
    } as AgenticConfig;
    // Hard defaults for anything still missing.
    merged.orientation ??= 'portrait';
    merged.aspect ??= '9:16';
    merged.transition ??= 'fade';
    merged.grade ??= 'cinematic';
    merged.kineticText ??= true;
    merged.kenBurns ??= true;
    merged.vignette ??= true;
    merged.captions ??= 'burned';
    merged.musicIntensity ??= 'mid';
    merged.candidatesPerAsset ??= 4;
    merged.backend ??= 'agent';
    merged.maxAttempts ??= 3;
    merged.renderer ??= 'ffmpeg';
    merged.pruneWorkspaces ??= 2;
    // Pro-edit (human-feel) defaults — free, rule-based, on by default.
    merged.hookFirst ??= true;
    merged.variablePacing ??= true;
    merged.jCutSec ??= 0.4;
    return merged;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
    const out: Partial<T> = {};
    for (const k of Object.keys(o) as (keyof T)[]) {
        if (o[k] !== undefined) out[k] = o[k];
    }
    return out;
}

/**
 * Load a config from a JSON file (path) or fall back to env-derived defaults.
 * The file may be a full AgenticConfig or { preset, ...overrides }.
 */
export function loadConfig(path?: string): Partial<AgenticConfig> {
    if (path) {
         
        const fs = require('fs');
        const raw = fs.readFileSync(path, 'utf8');
        return JSON.parse(raw) as Partial<AgenticConfig>;
    }
    return {};
}

/** Convert a resolved config into the PipelineRequest + render opts the engine uses. */
export function configToRequest(cfg: AgenticConfig) {
    const merged = configToRequest_buildReq(cfg);
    return merged;
}

function configToRequest_buildReq(cfg: AgenticConfig) {
    return {
        req: {
            topic: cfg.topic,
            title: cfg.title ?? cfg.topic,
            backend: cfg.backend,
            preferVisual: cfg.preferVisual,
            candidatesPerAsset: cfg.candidatesPerAsset,
            orientation: cfg.orientation,
            voice: cfg.voice,
            musicQuery: cfg.musicQuery,
            localAssets: cfg.localAssets,
            defaultVisual: cfg.defaultVisual,
        } as import('./orchestrate.js').PipelineRequest,
        render: {
            preset: cfg.preset ?? 'cinematic',
            sfx: cfg.sfx,
            kinetic: cfg.kineticText,
            crossfadeSec: 0.5,
        },
        autopilot: { renderer: cfg.renderer, preset: cfg.preset ?? 'cinematic', sfx: cfg.sfx, maxAttempts: cfg.maxAttempts },
    };
}
