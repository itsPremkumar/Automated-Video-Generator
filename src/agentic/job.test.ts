/**
 * job.test.ts — Phase 8 (state machine) + Phase 11 (metrics).
 * Pure, offline, deterministic. No network, no ffmpeg.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createJob, transition, updateJob, getJob, computeMetrics, JobState } from './job.js';

function fakeWs(jobId: string) {
    return { root: '/tmp/' + jobId, jobId } as any;
}

describe('agentic/job (Phase 8 state machine)', () => {
    it('starts in processing and transitions legally', () => {
        const rec = createJob('j1', fakeWs('j1'), { title: 'T' });
        assert.equal(rec.state, 'processing');
        const r2 = transition('j1', 'awaiting_review');
        assert.equal(r2.state, 'awaiting_review');
        const r3 = transition('j1', 'completed');
        assert.equal(r3.state, 'completed');
    });

    it('rejects illegal transitions', () => {
        createJob('j2', fakeWs('j2'));
        // from 'processing', 'pending' is NOT a legal target (see TRANSITIONS).
        assert.throws(() => transition('j2', 'pending'), /illegal transition/);
    });

    it('persists and retrieves by id', () => {
        const rec = createJob('j3', fakeWs('j3'), { topic: 'x' });
        updateJob('j3', { gatePass: true, rendered: true });
        const got = getJob('j3');
        assert.equal(got?.gatePass, true);
        assert.equal(got?.topic, 'x');
    });

    it('computes metrics across jobs', () => {
        createJob('m1', fakeWs('m1'));
        updateJob('m1', { gatePass: true, voiceoverDriven: true, state: 'completed' });
        createJob('m2', fakeWs('m2'));
        updateJob('m2', { gatePass: false, voiceoverDriven: false, state: 'failed' });
        const m = computeMetrics([3, 5]);
        assert.equal(m.totalJobs >= 2, true);
        assert.equal(m.completed >= 1, true);
        assert.equal(m.failed >= 1, true);
        assert.ok(m.gatePassRate > 0 && m.gatePassRate <= 1);
        assert.equal(m.avgScenes, 4);
    });
});
