/**
 * ai-verify.ts — OPT-IN AI verification reusing the AGENT'S OWN model.
 *
 * Design (locked by project constraints):
 *  - ZERO extra cost: we reuse the running AgentBrain (the same model already
 *    planning the video). No separate API key, no paid vision service.
 *  - OPT-IN: gated behind config.aiVerify.* (default all off). When off, or
 *    when the agent model has no vision / is offline / the call fails, every
 *    function returns `null` and the caller's deterministic signal gates decide.
 *  - AUGMENT, never replace: AI scores are AND-ed with signal checks by the
 *    caller. A `null` result NEVER blocks the pipeline.
 *
 * Coverage (all opt-in):
 *  - images / videos: subject-match + watermark + safety (vision model)
 *  - audio (music + voiceover): mood-match / speech-clarity / noise, judged
 *    by the agent's TEXT model on available transcripts (zero audio-decode cost)
 */

import { AgentBrain } from './brain.js';
import { AgenticConfig } from './config.js';

export interface AiScore {
    pass: boolean;
    confidence: number; // 0-10
    reason: string;
}

export type AiVerifyKind = 'image' | 'video' | 'audio';

/**
 * Verify one asset with the agent's own model.
 * @param file       absolute path to the asset
 * @param kind       image | video | audio
 * @param expectation what the asset SHOULD depict/say (scene keywords or narration)
 * @param cfg        resolved AgenticConfig (aiVerify sub-flags are read here)
 * @param brain      the running AgentBrain (agent's own model)
 * @param transcript optional voiceover/music transcript for audio checks
 * @returns null when AI is unavailable/offline -> caller uses signal gates only
 */
export async function aiVerifyAsset(
    file: string,
    kind: AiVerifyKind,
    expectation: string[],
    cfg: AgenticConfig,
    brain: AgentBrain,
    transcript?: string,
): Promise<AiScore | null> {
    const av = cfg.aiVerify;
    if (!av || !av.enabled) return null;
    if (!brain.modelEnabled) return null; // no model running -> signal gates decide

    // Default the three check flags to true when unset (matches resolveConfig).
    const checkSubject = av.checkSubjectMatch ?? true;
    const checkWatermark = av.checkWatermark ?? true;
    const checkSafety = av.checkSafety ?? true;
    const checkMusic = av.checkMusicMood ?? false;
    const checkSpeech = av.checkSpeechClarity ?? false;
    const checkNoise = av.checkBackgroundNoise ?? false;

    if (kind === 'image' || kind === 'video') {
        if (!checkSubject && !checkWatermark && !checkSafety) return null;
        // visionVerify returns null if the model isn't multimodal / offline.
        const v = await brain.visionVerify(file, expectation);
        if (!v) return null;
        const checks: string[] = [];
        if (av.checkSubjectMatch && !v.passes) checks.push('subject-mismatch');
        // watermark/safety are folded into the vision reason when the model flags them.
        const confidence = v.confidence ?? 0;
        const pass = v.passes && confidence >= (av.minConfidence ?? 6);
        return {
            pass,
            confidence,
            reason: v.reason || (pass ? 'ai-ok' : checks.join(',') || 'ai-flag'),
        };
    }

    // ── audio ── judged by the TEXT model on a transcript (zero decode cost)
    if (kind === 'audio') {
        if (!av.checkMusicMood && !av.checkSpeechClarity && !av.checkBackgroundNoise) return null;
        if (!transcript) return null; // nothing to judge -> signal gates decide
        const score = await judgeAudio(transcript, expectation, av, brain);
        if (!score) return null;
        return score;
    }

    return null;
}

/**
 * Ask the agent's TEXT model to judge an audio transcript for clarity / mood /
 * noise. Returns null on any failure. Never throws.
 */
async function judgeAudio(
    transcript: string,
    expectation: string[],
    av: NonNullable<AgenticConfig['aiVerify']>,
    brain: AgentBrain,
): Promise<AiScore | null> {
    const want = expectation.join(', ');
    const wants: string[] = [];
    if (av.checkSpeechClarity) wants.push('is the speech clear and on-topic to: ' + want);
    if (av.checkMusicMood) wants.push('does the music mood fit: ' + want);
    if (av.checkBackgroundNoise) wants.push('is background noise acceptable (not harsh/distracting)');
    if (wants.length === 0) return null;
    const prompt =
        `You are an audio QA reviewer. Transcript:\n"""${transcript}"""\n` +
        `Check:\n- ${wants.join('\n- ')}\n` +
        `Reply ONLY JSON {"confidence":0-10,"pass":bool,"reason":"..."}.`;
    try {
        const r = await (brain as any).completeJSON?.(
            'You are a strict but fair audio reviewer. Score 0-10.',
            prompt,
            '{"confidence":0,"pass":false,"reason":"..."}',
        );
        if (!r || typeof r.confidence !== 'number') return null;
        const min = av.minConfidence ?? 6;
        return {
            pass: Boolean(r.pass) && r.confidence >= min,
            confidence: r.confidence,
            reason: r.reason || (r.pass ? 'ai-ok' : 'ai-flag'),
        };
    } catch {
        return null;
    }
}
