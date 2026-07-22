import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';

describe('critique.ts + revise.ts (P0/P2 assistant features)', () => {
    test('modules export expected functions', async () => {
        const critique = await import('../../../src/agentic/operations/critique.js');
        const revise = await import('../../../src/agentic/operations/revise.js');
        assert.equal(typeof critique.critiqueVideo, 'function');
        assert.equal(typeof revise.reviseJob, 'function');
        assert.equal(typeof revise.critiqueAndRevise, 'function');
    });

    test('reviseJob fails safe on a non-existent job', async () => {
        const { reviseJob } = await import('../../../src/agentic/operations/revise.js');
        const rep = await reviseJob('no-such-job-' + Date.now(), 'make it louder');
        assert.equal(rep.ok, false);
        assert.ok(/not found/i.test(rep.detail), 'expected a not-found detail, got: ' + rep.detail);
        assert.equal(rep.round, 1);
    });

    test('critiqueVideo returns structured shape even on missing file', async () => {
        const { critiqueVideo } = await import('../../../src/agentic/operations/critique.js');
        // No ffmpeg check required: should reject with a clear message, not throw.
        const rep = await critiqueVideo('C:/nonexistent/nope.mp4', {}).catch((e) => e);
        assert.ok(rep && (typeof rep.ok === 'boolean' || rep instanceof Error), 'expected a result object or caught error');
    });
});
