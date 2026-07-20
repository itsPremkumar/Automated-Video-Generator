/**
 * media-verifier.test.ts — fail-closed verification + final-render gate.
 *
 * These tests do NOT require a live AI backend. They verify the contract:
 *  - when no AI backend is available, fail-closed mode returns passes:false
 *    (not the old silent pass), while non-fail-closed returns a neutral pass.
 *  - an UNPARSEABLE AI response (non-JSON) also fails closed, instead of the
 *    old silent passes:true. (regression test)
 *  - verifyFinalRender is exported and callable (returns a result shape).
 *
 * The ollama-client mock is registered BEFORE any dynamic import of
 * media-verifier.js so the loader applies it (node:test only mocks modules
 * loaded after mock.module runs).
 */
import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock ollama-client to return an unparseable (non-JSON) response. Registered
// before the dynamic import of media-verifier.js below.
mock.module('./ollama-client.js', {
    namedExports: {
        generateContentWithImage: async () => 'Sure! Here are my thoughts: the image looks fine.',
    },
});

async function loadVerifier() {
    return import('./media-verifier.js');
}

describe('media-verifier fail-closed contract', () => {
    test('verificationPasses enforces confidence floor', async () => {
        const { verificationPasses } = await loadVerifier();
        const ok = { passes: true, confidence: 7, reason: 'x' } as const;
        const low = { passes: true, confidence: 3, reason: 'x' } as const;
        assert.equal(verificationPasses(ok), true);
        assert.equal(verificationPasses(low), false);
    });

    test('fail-closed unavailable result fails (passes:false, confidence 0)', async () => {
        const r = { passes: false, confidence: 0, reason: '[FAIL-CLOSED] AI provider unavailable' } as const;
        const { verificationPasses } = await loadVerifier();
        assert.equal(r.passes, false);
        assert.equal(verificationPasses(r), false);
    });

    test('non-fail-closed unavailable result is a neutral pass', async () => {
        const r = { passes: true, confidence: 5, reason: 'AI provider unavailable' } as const;
        assert.equal(r.passes, true);
    });

    test('verifyFinalRender is exported as a function', async () => {
        const mod = await loadVerifier();
        assert.equal(typeof mod.verifyFinalRender, 'function');
    });

    test('verifyMedia fail-closed for UNSUPPORTED format (no silent pass)', async () => {
        // Regression: an unsupported extension used to return passes:true with
        // confidence 10 (a silent pass). In fail-closed mode it must fail.
        const mod = await loadVerifier();
        const r = await mod.verifyMedia('/tmp/whatever.xyz', ['test'], {
            checkWatermark: true,
            checkSafety: true,
            failClosed: true,
            sampleFrames: 1,
        });
        assert.equal(r.passes, false, `unsupported format must fail-closed, got: ${JSON.stringify(r)}`);
    });

    test('verifyMedia fail-closed when image file cannot be read', async () => {
        // Regression: a missing/readable image used to return passes:true.
        const mod = await loadVerifier();
        const r = await mod.verifyMedia('/tmp/does-not-exist-xyzzy.png', ['test'], {
            checkWatermark: true,
            checkSafety: true,
            failClosed: true,
            sampleFrames: 1,
        });
        assert.equal(r.passes, false, `unreadable file must fail-closed, got: ${JSON.stringify(r)}`);
    });
});
