/**
 * gate.test.ts — Unit tests for STAGE 5 holistic final gate (X1-X6).
 *
 * Exercises runFinalGate with crafted plans/candidates/decisions/manifests to
 * prove each cross-check fires correctly and that the gate only passes when
 * EVERYTHING is verified, decided, and on-spec.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { runFinalGate } from './gate.js';
import { Plan, AssetCandidate, AssetDecision, RenderManifest } from '../types.js';

function plan(n = 2): Plan {
    return {
        jobId: 'gate-job',
        title: 'Gate',
        orientation: 'portrait',
        voice: 'en-US-JennyNeural',
        musicQuery: 'ambient',
        totalDurationSec: n * 4,
        scenes: Array.from({ length: n }, (_, i) => ({
            sceneNumber: i + 1,
            voiceoverText: `s${i}`,
            searchKeywords: ['k'],
            visualPreference: 'image' as const,
            durationSec: 4,
        })),
    } as Plan;
}

function candidates(n = 2): AssetCandidate[] {
    return Array.from({ length: n }, (_, i) => ({
        kind: i === 0 ? 'music' : 'image',
        sceneIndex: i === 0 ? -1 : i - 1,
        candidateIndex: 1,
        localPath: `/tmp/a${i}.jpg`,
        url: 'u',
        source: 'pexels',
        license: 'CC0',
        keywords: ['k'],
    }));
}

function approvedAll(cands: AssetCandidate[]): AssetDecision[] {
    return cands.map((c) => ({
        assetId: `${c.kind}_s${c.sceneIndex}_c${c.candidateIndex}`,
        kind: c.kind,
        sceneIndex: c.sceneIndex,
        decision: 'approved',
        rationale: '',
        decidedBy: 'agent',
        fallbackUsed: false,
    }));
}

function manifestFor(cands: AssetCandidate[]): RenderManifest {
    return {
        jobId: 'gate-job',
        title: 'Gate',
        orientation: 'portrait',
        voice: 'en-US-JennyNeural',
        musicQuery: 'ambient',
        assets: cands.map((c) => ({ kind: c.kind, sceneIndex: c.sceneIndex, localPath: c.localPath, license: c.license })),
        generatedAt: new Date().toISOString(),
    };
}

test('runFinalGate passes when all checks green', () => {
    const p = plan(2);
    const cands = candidates(3); // 1 music + 2 images
    const decs = approvedAll(cands);
    const m = manifestFor(cands);
    const report = runFinalGate(p, cands, decs, m);
    assert.equal(report.pass, true);
    const ids = report.checks.map((c) => c.id);
    assert.ok(ids.includes('X1') && ids.includes('X2') && ids.includes('X3') && ids.includes('X4') && ids.includes('X5') && ids.includes('X6'));
});

test('X2 fails when a scene has no approved visual', () => {
    const p = plan(2);
    const cands = candidates(3);
    const decs = approvedAll(cands).filter((d) => d.sceneIndex !== 1); // drop scene 1 approval
    const m = manifestFor(cands);
    const report = runFinalGate(p, cands, decs, m);
    const x2 = report.checks.find((c) => c.id === 'X2')!;
    assert.equal(x2.pass, false);
    assert.equal(report.pass, false);
});

test('X3 fails when an asset lacks a decision', () => {
    const p = plan(2);
    const cands = candidates(3);
    const decs = approvedAll(cands).slice(0, 2); // leave 1 undecided
    const m = manifestFor(cands);
    const report = runFinalGate(p, cands, decs, m);
    const x3 = report.checks.find((c) => c.id === 'X3')!;
    assert.equal(x3.pass, false);
});

test('X5 fails when runtime exceeds platform cap', () => {
    const p = plan(2);
    p.totalDurationSec = 999; // way over 60s shorts cap
    const cands = candidates(3);
    const decs = approvedAll(cands);
    const m = manifestFor(cands);
    const report = runFinalGate(p, cands, decs, m, { platform: 'shorts' });
    const x5 = report.checks.find((c) => c.id === 'X5')!;
    assert.equal(x5.pass, false);
});

test('X6 fails when an approved asset has no license', () => {
    const p = plan(2);
    const cands = candidates(3).map((c, i) => (i === 1 ? { ...c, license: undefined } : c));
    const decs = approvedAll(cands);
    const m = manifestFor(cands);
    const report = runFinalGate(p, cands, decs, m);
    const x6 = report.checks.find((c) => c.id === 'X6')!;
    assert.equal(x6.pass, false);
});

test('X1 duration alignment passes when manifest duration matches plan', () => {
    const p = plan(2);
    p.totalDurationSec = 12; // 2 images × 4 + 1 music × 4 = 12
    const cands = candidates(3);
    const m = manifestFor(cands);
    m.assets = m.assets.map((a) => ({ ...a, durationSec: 4 }));
    const report = runFinalGate(p, cands, approvedAll(cands), m);
    const x1 = report.checks.find((c) => c.id === 'X1')!;
    assert.equal(x1.pass, true);
});

test('Gate blocks render when manifest is null', () => {
    const p = plan(2);
    const cands = candidates(3);
    const report = runFinalGate(p, cands, approvedAll(cands), null);
    assert.equal(report.pass, false);
});
