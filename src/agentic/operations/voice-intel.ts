/**
 * voice-intel.ts — Advanced voice signals, all optional & off by default.
 *
 * Maps to agentic-scripts.json:
 *   ttsStyle            → Edge-TTS style tag (cheerful/whispering/…)
 *   voicesByScene       → per-scene voice override map
 *   voiceSpeed          → 0.5–2.0 playback speed (Edge-TTS rate)
 *   voicePitchSemitones → pitch shift (Voicebox/Kokoro path)
 *   voiceAging          → 'younger'|'older' preset (zero-cost pitch shift;
 *                         younger = +4 semitones, older = -4 semitones)
 *   dubLanguage         → translate the script before TTS (heuristic offline)
 *   useClonedVoiceId    → reuse a saved clone profile to narrate
 *   dialogueVoices      → two-voice alternating dialogue
 *
 * This module is a CONFIGURATION LAYER: it computes the per-scene voice
 * parameters (voice id, rate, style, pitch) that downstream TTS consumes. It
 * does not reimplement TTS — it enriches the ScenePlan.voiceOverride etc.
 */

export interface SceneVoiceConfig {
    voice: string;
    rate: number;   // 0.5–2.0
    style?: string;
    pitch?: number; // semitones
}

const EDGE_RATE = (speed: number) => Math.max(0.5, Math.min(2, speed));

/** Translate a script string into a target language using a tiny offline
 *  dictionary for demo langs (hi/ta). Real translation would call a model;
 *  this keeps the pipeline zero-cost and testable. Falls back to source. */
export function dubScript(text: string, lang: string): string {
    // Minimal illustrative map; production would use a translator backend.
    const greet: Record<string, string> = {
        hi: 'नमस्ते, ', ta: 'வணக்கம், ', es: 'Hola, ', fr: 'Bonjour, ',
    };
    const tail: Record<string, string> = {
        hi: ' (हिंदी में)', ta: ' (தமிழில்)', es: ' (en español)', fr: ' (en français)',
    };
    const g = greet[lang]; const t = tail[lang];
    if (!g) return text;
    return `${g}${text}${t ?? ''}`;
}

/** Build per-scene voice configs from job-level voice signals. */
export function buildVoiceConfigs(
    sceneCount: number,
    opts: {
        baseVoice?: string;
        ttsStyle?: string;
        voicesByScene?: Record<number, string>;
        voiceSpeed?: number;
        voicePitchSemitones?: number;
        voiceAging?: 'younger' | 'older';
        dialogueVoices?: [string, string];
        useClonedVoiceId?: string;
    },
): SceneVoiceConfig[] {
    // Default base voice MUST match buildPlan()/single-feature's default
    // ('en-US-JennyNeural'). 'en-US-GuyNeural' was the prior hardcoded
    // default and it is the voice that times out on a flaky Edge-TTS
    // connection, so an unset job.voice would fail the whole voice stage
    // (and silently override the Jenny default set upstream by buildPlan).
    const base = opts.baseVoice ?? 'en-US-JennyNeural';
    const speed = EDGE_RATE(opts.voiceSpeed ?? 1);
    // voiceAging preset → semitone shift (zero-cost, no neural backend needed).
    const agingShift = opts.voiceAging === 'younger' ? 4 : opts.voiceAging === 'older' ? -4 : 0;
    const pitch = (opts.voicePitchSemitones ?? 0) + agingShift;
    const cfgs: SceneVoiceConfig[] = [];
    for (let i = 0; i < sceneCount; i++) {
        let voice = opts.voicesByScene?.[i] ?? base;
        if (opts.dialogueVoices) voice = opts.dialogueVoices[i % 2];
        if (opts.useClonedVoiceId) voice = opts.useClonedVoiceId; // resolved to profile downstream
        cfgs.push({
            voice,
            rate: speed,
            style: opts.ttsStyle,
            pitch,
        });
    }
    return cfgs;
}

/** Apply computed voice configs onto a Plan's scenes (mutates + returns). */
export function applyVoiceConfigsToPlan(plan: { scenes: Array<{ voiceOverride?: string; jCutSec?: number }> }, cfgs: SceneVoiceConfig[]): void {
    plan.scenes.forEach((s, i) => {
        const c = cfgs[i];
        if (c) s.voiceOverride = c.voice;
    });
}
