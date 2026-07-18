import assert from 'node:assert';
import { test } from 'node:test';
import { runFinalGate } from './gate.js';
import { assetId } from './types.js';
import type { AssetCandidate, AssetDecision, Plan, RenderManifest } from './types.js';

function plan(scenes = 2, totalDurationSec = 30): Plan {
    return {
        jobId: 'job1',
        title: 'Test',
        orientation: 'portrait',
        voice: 'en-US-1',
        musicQuery: 'calm',
        scenes: Array.from({ length: scenes }, (_, i) => ({
            sceneNumber: i + 1,
            voiceoverText: `scene ${i + 1}`,
            searchKeywords: ['k'],
            visualPreference: 'image' as const,
            durationSec: totalDurationSec / scenes,
        })),
        totalDurationSec,
    };
}

function imageCandidate(sceneIndex: number, candidateIndex = 0, license = 'CC-BY'): AssetCandidate {
    return {
        kind: 'image',
        sceneIndex,
        candidateIndex,
        localPath: `/a/s${sceneIndex}_c${candidateIndex}.jpg`,
        url: 'https://example.com/a.jpg',
        source: 'test',
        license,
        keywords: ['k'],
    };
}

function approve(
    d: AssetDecision['decision'],
    sceneIndex: number,
    kind: AssetCandidate['kind'] = 'image',
    candidateIndex = 0,
): AssetDecision {
    return {
        assetId: assetId(kind, sceneIndex, candidateIndex),
        kind,
        sceneIndex,
        decision: d,
        rationale: 't',
        decidedBy: 'agent',
        fallbackUsed: false,
    };
}

test('runFinalGate: all green when every scene approved with license + manifest present', () => {
    const p = plan(2, 30);
    const candidates = [imageCandidate(0), imageCandidate(1)];
    const decisions = [approve('approved', 0), approve('approved', 1)];
    const manifest: RenderManifest = {
        jobId: 'job1',
        title: 'Test',
        orientation: 'portrait',
        voice: 'en-US-1',
        musicQuery: 'calm',
        assets: [
            { kind: 'image', sceneIndex: 0, localPath: '/a', durationSec: 15 },
            { kind: 'image', sceneIndex: 1, localPath: '/a', durationSec: 15 },
        ],
        generatedAt: new Date().toISOString(),
    };
    const r = runFinalGate(p, candidates, decisions, manifest);
    assert.strictEqual(r.pass, true);
    // All X1..X6 present
    const ids = r.checks.map((c) => c.id);
    for (const id of ['X1', 'X2', 'X3', 'X4', 'X5', 'X6']) {
        assert.ok(ids.includes(id), `missing check ${id}`);
    }
    for (const c of r.checks) assert.strictEqual(c.pass, true, `check ${c.id} should pass: ${c.detail}`);
});

test('runFinalGate: X2 fails when a scene has no approved visual', () => {
    const p = plan(3, 30);
    const candidates = [imageCandidate(0), imageCandidate(1), imageCandidate(2)];
    const decisions = [approve('approved', 0), approve('approved', 1)]; // scene 2 missing
    const r = runFinalGate(p, candidates, decisions, null);
    const x2 = r.checks.find((c) => c.id === 'X2')!;
    assert.strictEqual(x2.pass, false);
    assert.strictEqual(r.pass, false);
});

test('runFinalGate: X3 fails when an asset has no decision (unresolved)', () => {
    const p = plan(2, 30);
    const candidates = [imageCandidate(0), imageCandidate(1)];
    const decisions = [approve('approved', 0)]; // candidate 1 un-decided
    const r = runFinalGate(p, candidates, decisions, null);
    const x3 = r.checks.find((c) => c.id === 'X3')!;
    assert.strictEqual(x3.pass, false);
});

test('runFinalGate: X4 + overall fail when manifest is null', () => {
    const p = plan(2, 30);
    const candidates = [imageCandidate(0), imageCandidate(1)];
    const decisions = [approve('approved', 0), approve('approved', 1)];
    const r = runFinalGate(p, candidates, decisions, null);
    assert.strictEqual(r.checks.find((c) => c.id === 'X4')!.pass, false);
    assert.strictEqual(r.pass, false);
});

test('runFinalGate: X5 fails when runtime exceeds platform cap', () => {
    const p = plan(1, 200); // 200s
    const candidates = [imageCandidate(0)];
    const decisions = [approve('approved', 0)];
    const r = runFinalGate(p, candidates, decisions, null, { platform: 'shorts' }); // cap 60s
    const x5 = r.checks.find((c) => c.id === 'X5')!;
    assert.strictEqual(x5.pass, false);
    assert.match(x5.detail, /200s <= 60s/);
});

test('runFinalGate: X5 honours explicit maxRuntimeSec override', () => {
    const p = plan(1, 200);
    const candidates = [imageCandidate(0)];
    const decisions = [approve('approved', 0)];
    const r = runFinalGate(p, candidates, decisions, null, { maxRuntimeSec: 300 }); // 200 <= 300 ok
    assert.strictEqual(r.checks.find((c) => c.id === 'X5')!.pass, true);
});

test('runFinalGate: X6 fails when an approved asset lacks a license', () => {
    const p = plan(2, 30);
    const candidates = [imageCandidate(0, 0, 'CC-BY'), imageCandidate(1, 0, '')]; // second has no license
    const decisions = [approve('approved', 0), approve('approved', 1)];
    const r = runFinalGate(p, candidates, decisions, null);
    const x6 = r.checks.find((c) => c.id === 'X6')!;
    assert.strictEqual(x6.pass, false);
    assert.match(x6.detail, /1 asset\(s\) without any license/);
});

test('runFinalGate: X1 aligns when manifest durations match plan (within 10% drift)', () => {
    const p = plan(1, 30);
    const candidates = [imageCandidate(0)];
    const decisions = [approve('approved', 0)];
    const manifest: RenderManifest = {
        jobId: 'job1',
        title: 'T',
        orientation: 'portrait',
        voice: 'v',
        musicQuery: 'm',
        assets: [{ kind: 'image', sceneIndex: 0, localPath: '/a', durationSec: 31 }], // drift 1s < 3s
        generatedAt: new Date().toISOString(),
    };
    const x1 = runFinalGate(p, candidates, decisions, manifest).checks.find((c) => c.id === 'X1')!;
    assert.strictEqual(x1.pass, true);
});

test('runFinalGate: X1 fails when manifest durations drift beyond 10%', () => {
    const p = plan(1, 30);
    const candidates = [imageCandidate(0)];
    const decisions = [approve('approved', 0)];
    const manifest: RenderManifest = {
        jobId: 'job1',
        title: 'T',
        orientation: 'portrait',
        voice: 'v',
        musicQuery: 'm',
        assets: [{ kind: 'image', sceneIndex: 0, localPath: '/a', durationSec: 50 }], // drift 20s
        generatedAt: new Date().toISOString(),
    };
    const x1 = runFinalGate(p, candidates, decisions, manifest).checks.find((c) => c.id === 'X1')!;
    assert.strictEqual(x1.pass, false);
});
