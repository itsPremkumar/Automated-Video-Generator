/**
 * revision.test.ts — verify STAGE 16 client review / revision loop state machine.
 * Pure fs + JSON, offline, no ffmpeg. Exercises the full lifecycle.
 */

import * as fs from 'fs';
import * as path from 'path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openReview, requestChanges, resolveRound, approve, cancel, isApproved, loadRevision } from '../../../src/agentic/delivery/revision.js';
import { AgenticWorkspace } from '../../../src/agentic/management/workspace.js';

function ws(root: string, jobId = 'job_rev'): AgenticWorkspace {
    fs.mkdirSync(root, { recursive: true });
    return {
        jobId,
        root,
        assetsDir: path.join(root, 'assets'),
        imagesDir: path.join(root, 'assets', 'images'),
        videosDir: path.join(root, 'assets', 'videos'),
        musicDir: path.join(root, 'assets', 'music'),
        verificationDir: path.join(root, 'verification'),
        audioDir: path.join(root, 'audio'),
    };
}

test('full lifecycle: open → request changes → resolve → approve', () => {
    const root = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rev-'));
    try {
        const w = ws(root);
        let st = openReview(w, 'job_rev', 'Coffee Facts');
        assert.equal(st.state, 'in_review');

        st = requestChanges(w, 'client', 'Make it punchier, change music', [
            { scope: 'music', detail: 'use cinematic' },
            { scope: 'script', detail: 'shorter hook' },
        ]);
        assert.equal(st.state, 'changes_requested');
        assert.equal(st.currentRound, 1);
        assert.equal(st.rounds.length, 1);
        assert.equal(st.rounds[0].changes?.length, 2);

        st = resolveRound(w, 'job_rev_v2');
        assert.equal(st.state, 'in_review');
        assert.equal(st.rounds[0].resultJobId, 'job_rev_v2');

        st = approve(w, 'client');
        assert.equal(st.state, 'approved');
        assert.equal(isApproved(w), true);

        // persisted + reloadable
        const reloaded = loadRevision(w);
        assert.equal(reloaded?.state, 'approved');
        assert.equal(reloaded?.rounds[0].resultJobId, 'job_rev_v2');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('requestChanges after approval re-opens a new revision round', () => {
    const root = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rev2-'));
    try {
        const w = ws(root);
        openReview(w, 'job_rev', 'T');
        approve(w); // round -> 1
        // requesting changes after approval still records a NEW round (re-opens review)
        const st = requestChanges(w, 'client', 'one more tweak');
        assert.equal(st.state, 'changes_requested');
        assert.equal(st.currentRound, 2);
        assert.equal(st.rounds.length, 2);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('cancel transitions to cancelled', () => {
    const root = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rev3-'));
    try {
        const w = ws(root);
        openReview(w, 'job_rev', 'T');
        const st = cancel(w);
        assert.equal(st.state, 'cancelled');
        assert.equal(isApproved(w), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('loadRevision returns null for a fresh workspace', () => {
    const root = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rev4-'));
    try {
        const w = ws(root);
        assert.equal(loadRevision(w), null);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
