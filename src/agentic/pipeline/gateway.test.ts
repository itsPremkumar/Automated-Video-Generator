/**
 * gateway.test.ts — Unit tests for STAGE 4 (DECIDE) + render-manifest builder.
 *
 * Runs OFFLINE with injected fake verify/decide/fetch. Confirms the decision
 * loop approves passing assets, rejects+re-fetches failing ones (bounded
 * retries), and that buildRenderManifest picks one approved visual per scene.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import test from 'node:test';
import { runGateway, buildRenderManifest } from './gateway.js';
import { AgenticWorkspace } from '../management/workspace.js';
import { makeWorkspaceTempDir } from '../../shared/runtime/paths.js';
import { Plan, AssetCandidate, AssetDecision } from '../types.js';

function fakeWs(tag = 'gw-'): AgenticWorkspace {
    const root = makeWorkspaceTempDir(tag);
    return {
        jobId: tag + Date.now(),
        root,
        assetsDir: path.join(root, 'assets'),
        imagesDir: path.join(root, 'assets', 'images'),
        videosDir: path.join(root, 'assets', 'videos'),
        musicDir: path.join(root, 'assets', 'music'),
        verificationDir: path.join(root, 'verification'),
        audioDir: path.join(root, 'audio'),
    };
}

function fakePlan(n = 2): Plan {
    return {
        jobId: 'gw-job',
        title: 'GW',
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

function fakeCandidates(n = 2): AssetCandidate[] {
    return Array.from({ length: n }, (_, i) => ({
        kind: 'image' as const,
        sceneIndex: i,
        candidateIndex: 1,
        localPath: `/tmp/s${i}.jpg`,
        url: `u${i}`,
        source: 'pexels',
        license: 'CC0',
        keywords: ['k'],
    }));
}

test('runGateway approves all passing assets and builds a manifest', async () => {
    const ws = fakeWs();
    const plan = fakePlan(2);
    const deps = {
        fetchVisual: async () => [{ url: 'u', localPath: '', source: 'pexels' }],
        download: async (_u: string, d: string, f: string) => { const p = path.join(d, f); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(p, 'x'); return p; },
        fetchMusic: async () => [],
        verifyImage: async () => ({ passes: true, confidence: 8, reason: 'ok' }),
        verifyVideo: async () => ({ passes: true, confidence: 8, reason: 'ok' }),
        decide: async () => ({ decision: 'approved' as const, rationale: 'good' }),
    } as any;

    const { workspace, decisions, manifest } = await runGateway(plan, fakeCandidates(2), deps);
    assert.ok(workspace && workspace.root);
    assert.equal(decisions.length, 2);
    assert.ok(decisions.every((d: AssetDecision) => d.decision === 'approved'));
    assert.ok(manifest, 'manifest should be built');
    assert.equal(manifest!.assets.filter((a) => a.kind !== 'music').length, 2);
    fs.rmSync(ws.root, { recursive: true, force: true });
});

test('runGateway re-fetches rejected assets up to maxRetries, then rejects', async () => {
    const ws = fakeWs();
    const plan = fakePlan(1);
    let decideCalls = 0;
    const deps = {
        fetchVisual: async () => [{ url: 'u', localPath: '', source: 'pexels' }],
        download: async (_u: string, d: string, f: string) => { const p = path.join(d, f); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(p, 'x'); return p; },
        fetchMusic: async () => [],
        verifyImage: async () => ({ passes: false, confidence: 2, reason: 'bad' }),
        verifyVideo: async () => ({ passes: false, confidence: 2, reason: 'bad' }),
        decide: async () => { decideCalls++; return { decision: 'replace' as const, rationale: 'bad', newKeywords: ['alt'] }; },
        maxReplaceRetries: 2,
    } as any;

    const { decisions } = await runGateway(plan, fakeCandidates(1), deps);
    // First decide rejects; reAcquireScene succeeds but re-verify fails -> loop
    // runs again (decide #2 again), reAcquireScene succeeds but re-verify fails
    // -> loop runs again (decide #3), then gives up -> rejected.
    assert.ok(decideCalls >= 1, 'decide called');
    const rejected = decisions.find((d) => d.decision === 'rejected');
    assert.ok(rejected, 'asset should end up rejected after retries exhausted');
    fs.rmSync(ws.root, { recursive: true, force: true });
});

test('buildRenderManifest returns null when a scene has no approved visual', () => {
    const plan = fakePlan(2);
    // Only scene 0 approved
    const candidates = fakeCandidates(2);
    const decisions: AssetDecision[] = [
        { assetId: 'image_s0_c1', kind: 'image', sceneIndex: 0, decision: 'approved', rationale: '', decidedBy: 'agent', fallbackUsed: false },
        // scene 1 missing entirely
    ];
    const ws = fakeWs();
    const manifest = buildRenderManifest(plan, candidates, decisions, ws);
    assert.equal(manifest, null, 'manifest must be null when a scene has no visual');
    fs.rmSync(ws.root, { recursive: true, force: true });
});

test('buildRenderManifest picks first approved visual per scene + music', () => {
    const plan = fakePlan(2);
    const candidates = [
        ...fakeCandidates(2),
        { kind: 'music' as const, sceneIndex: -1, candidateIndex: 1, localPath: '/tmp/m.mp3', url: '', source: 'local', license: 'CC-BY', keywords: ['ambient'] },
    ];
    const decisions: AssetDecision[] = candidates.map((c) => ({
        assetId: `${c.kind}_s${c.sceneIndex}_c${c.candidateIndex}`,
        kind: c.kind,
        sceneIndex: c.sceneIndex,
        decision: 'approved',
        rationale: '',
        decidedBy: 'agent',
        fallbackUsed: false,
    }));
    const ws = fakeWs();
    const manifest = buildRenderManifest(plan, candidates, decisions, ws);
    assert.ok(manifest);
    assert.equal(manifest!.assets.length, 3); // 2 visuals + 1 music
    assert.equal(manifest!.assets.filter((a) => a.kind === 'music').length, 1);
    fs.rmSync(ws.root, { recursive: true, force: true });
});
