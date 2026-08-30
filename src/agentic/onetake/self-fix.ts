/**
 * self-fix.ts — Root-cause analysis → targeted re-render.
 *
 * Given a failed CritiqueVerdict, decide WHAT to fix and HOW.
 * The fix is applied by modifying the pipeline request and re-running
 * the render phase (not the whole pipeline — that would waste research).
 */
import { logInfo, logWarn } from '../../shared/logging/runtime-logging.js';
import type { CritiqueVerdict } from './types.js';

export interface FixDecision {
    action: 're-render' | 're-acquire' | 're-grade' | 'none';
    /** Human-readable reason for the log */
    reason: string;
    /** Modified request fields to apply before re-render */
    requestPatch: Record<string, unknown>;
}

/**
 * Analyze a failed critique and decide what to fix.
 *
 * Strategy:
 *   - blackdetect fail → the render dropped frames; re-render with
 *     higher frame rate tolerance (or fall back to simpler filters)
 *   - freezedetect fail → last-frame hold issue; re-render with
 *     explicit -t duration matching audio
 *   - astats fail (silent) → voiceover didn't generate; re-run voice
 *     generation with a different backend
 *   - cropdetect fail → wrong orientation; re-grade with correct dims
 */
export function decideFix(verdict: CritiqueVerdict): FixDecision {
    const failedGate = verdict.gates.find(g => !g.pass);

    if (!failedGate) {
        return { action: 'none', reason: 'All gates passed — no fix needed', requestPatch: {} };
    }

    switch (failedGate.id) {
        case 'blackdetect':
            return {
                action: 're-render',
                reason: `Black frames detected: ${failedGate.detail}. Will re-render with safer filter chain (drop heavy grade, reduce motion FX).`,
                requestPatch: { forceGrade: 'neutral', safeFilterMode: true },
            };

        case 'freezedetect':
            return {
                action: 're-render',
                reason: `Freeze detected: ${failedGate.detail}. Will re-render with explicit -t duration and disable last-frame hold.`,
                requestPatch: { explicitDurationHold: false },
            };

        case 'astats':
            return {
                action: 're-acquire',
                reason: `Audio silent/missing: ${failedGate.detail}. Will re-run voice generation with fallback backend.`,
                requestPatch: { voiceBackendFallback: 'edge-tts' },
            };

        case 'cropdetect':
            return {
                action: 're-grade',
                reason: `Wrong aspect ratio: ${failedGate.detail}. Will re-render with correct output dimensions.`,
                requestPatch: { forceOrientationFix: true },
            };

        default:
            return {
                action: 're-render',
                reason: `Unknown gate failure: ${failedGate.id}. Will re-render with conservative settings.`,
                requestPatch: { forceGrade: 'neutral', safeFilterMode: true },
            };
    }
}

/**
 * Apply a fix decision to a pipeline request, returning the modified request.
 */
export function applyFix<T extends Record<string, unknown>>(request: T, fix: FixDecision): T {
    return { ...request, ...fix.requestPatch };
}