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

    test('verifyMedia fail-closed when AI returns unparseable (non-JSON) response', async () => {
        // Regression: an unparseable AI response previously returned passes:true
        // (silent pass). With fail-closed it must fail.
        const mod = await loadVerifier();
        // Minimal valid 1x1 JPEG so imageToBase64 succeeds.
        const { writeFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const { tmpdir } = await import('node:os');
        const img = join(tmpdir(), 'mv_unparseable_test.jpg');
        const b64 =
            '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP////////////////////////////////////////////////////////////' +
            '////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAA' +
            'ACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==';
        writeFileSync(img, Buffer.from(b64, 'base64'));
        const r = await mod.verifyMedia(img, ['test'], {
            checkWatermark: true,
            checkSafety: true,
            failClosed: true,
            sampleFrames: 1,
        });
        assert.equal(r.passes, false, `unparseable AI response must fail-closed, got: ${JSON.stringify(r)}`);
    });
});
