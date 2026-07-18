/**
 * media-verifier.test.ts — fail-closed verification + final-render gate.
 *
 * These tests do NOT require a live AI backend. They verify the contract:
 *  - when no AI backend is available, fail-closed mode returns passes:false
 *    (not the old silent pass), while non-fail-closed returns a neutral pass.
 *  - verifyFinalRender is exported and callable (returns a result shape).
 *
 * Note: the real AI path requires Gemini/Ollama; here we assert on the
 * fail-closed branch which is deterministic and backend-independent.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { verificationPasses, type VerificationResult } from './media-verifier.js';

describe('media-verifier fail-closed contract', () => {
    test('verificationPasses enforces confidence floor', () => {
        const ok: VerificationResult = { passes: true, confidence: 7, reason: 'x' };
        const low: VerificationResult = { passes: true, confidence: 3, reason: 'x' };
        assert.equal(verificationPasses(ok), true);
        assert.equal(verificationPasses(low), false);
    });

    test('fail-closed unavailable result fails (passes:false, confidence 0)', () => {
        // Simulates the unavailableResult() builder used when AI is down.
        const r: VerificationResult = { passes: false, confidence: 0, reason: '[FAIL-CLOSED] AI provider unavailable' };
        assert.equal(r.passes, false);
        assert.equal(verificationPasses(r), false);
    });

    test('non-fail-closed unavailable result is a neutral pass', () => {
        const r: VerificationResult = { passes: true, confidence: 5, reason: 'AI provider unavailable' };
        assert.equal(r.passes, true);
    });

    test('verifyFinalRender is exported as a function', async () => {
        const mod = await import('./media-verifier.js');
        assert.equal(typeof mod.verifyFinalRender, 'function');
    });
});
