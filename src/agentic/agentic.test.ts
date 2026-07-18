import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildPlan, deriveMusicQuery, Parser } from './plan.js';
import { acquireAssets, AcquireDeps, FetchedVisual } from './acquire.js';
import { verifyAll, VERIFY_PASS_CONFIDENCE } from './verify.js';
import { runFinalGate } from './gate.js';
import { runGateway, GatewayDeps } from './gateway.js';
import { Plan, AssetCandidate, AssetDecision } from './types.js';
import { writeScriptHeuristic, expandKeywordsHeuristic, agentDecide } from './agent.js';

// ── helpers ──────────────────────────────────────────────
function tmpFile(ext: string): string {
    return path.join(os.tmpdir(), `avg_test_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
}

function makeCandidate(kind: 'image' | 'video' | 'music', sceneIndex: number, c: number, p: string): AssetCandidate {
    return {
        kind,
        sceneIndex,
        candidateIndex: c,
        localPath: p,
        url: `http://x/${kind}${c}.bin`,
        source: 'test',
        keywords: ['cat'],
    };
}

function fakeParser(script: string): any {
    const lines = script.split('\n').filter((l) => l.trim().length > 0);
    const scenes: {
        sceneNumber: number;
        voiceoverText: string;
        searchKeywords: string[];
        visualPreference: 'image' | 'video';
        duration: number;
    }[] = lines.map((line, i) => ({
        sceneNumber: i + 1,
        voiceoverText: line,
        searchKeywords: ['scene', `kw${i}`],
        visualPreference: 'video',
        duration: 5,
    }));
    return {
        scenes,
        totalDuration: lines.length * 5,
        videoStyle: 'professional' as const,
    };
}

const samplePlan: Plan = {
    jobId: 'job_test',
    title: 'Test Video',
    orientation: 'portrait',
    voice: 'en-US-JennyNeural',
    musicQuery: 'ambient lofi',
    scenes: [
        { sceneNumber: 1, voiceoverText: 'hello', searchKeywords: ['cat'], visualPreference: 'video', durationSec: 5 },
        { sceneNumber: 2, voiceoverText: 'world', searchKeywords: ['dog'], visualPreference: 'image', durationSec: 5 },
    ],
    totalDurationSec: 10,
};

// ── STAGE 1: plan ──────────────────────────────────────
import { rmSync } from 'fs';

// Clean up the runtime job workspace the tests generate so it doesn't
// pollute the repo working tree (it's gitignored, but we remove it anyway).
process.on('exit', () => {
    try {
        rmSync(path.join('agentic-pipeline', 'workspaces', 'job_test'), { recursive: true, force: true });
    } catch {
        /* ignore */
    }
});

describe('plan.ts', () => {
    test('derives music query from keywords', () => {
        assert.equal(
            deriveMusicQuery([
                {
                    sceneNumber: 1,
                    voiceoverText: '',
                    searchKeywords: ['workout', 'gym'],
                    visualPreference: 'video',
                    durationSec: 5,
                },
            ]),
            'energetic upbeat workout',
        );
        assert.equal(
            deriveMusicQuery([
                {
                    sceneNumber: 1,
                    voiceoverText: '',
                    searchKeywords: ['calm', 'sleep'],
                    visualPreference: 'video',
                    durationSec: 5,
                },
            ]),
            'calm ambient lofi',
        );
        assert.equal(
            deriveMusicQuery([
                {
                    sceneNumber: 1,
                    voiceoverText: '',
                    searchKeywords: ['random'],
                    visualPreference: 'video',
                    durationSec: 5,
                },
            ]),
            'ambient lofi chill',
        );
    });

    test('buildPlan uses injected parser and enriches scenes', async () => {
        const plan = await buildPlan(
            'line one\nline two',
            { jobId: 'j1', title: 'T', orientation: 'landscape' },
            fakeParser,
        );
        assert.equal(plan.scenes.length, 2);
        assert.equal(plan.title, 'T');
        assert.equal(plan.orientation, 'landscape');
        assert.equal(plan.musicQuery, 'ambient lofi chill');
    });
});

// ── STAGE 2: acquire (offline with fakes) ──────────────
describe('acquire.ts', () => {
    const deps: AcquireDeps = {
        fetchVisual: async (keywords: string[], kind: 'image' | 'video'): Promise<FetchedVisual[]> => {
            const ext = kind === 'image' ? '.jpg' : '.mp4';
            return [
                {
                    url: `http://x/${keywords[0]}_1${ext}`,
                    localPath: '',
                    source: 'fake',
                    license: 'CC0',
                    licenseUrl: 'http://lic',
                },
                {
                    url: `http://x/${keywords[0]}_2${ext}`,
                    localPath: '',
                    source: 'fake',
                    license: 'CC0',
                    licenseUrl: 'http://lic',
                },
            ];
        },
        download: async (url: string, dir: string, filename: string) => {
            const p = path.join(dir, filename);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(p, 'dummy');
            return p;
        },
        fetchMusic: async (): Promise<FetchedVisual[]> => [
            { url: 'http://x/m1.mp3', localPath: '', source: 'fake', license: 'CC0', licenseUrl: 'http://lic' },
        ],
    };

    test('downloads candidates into per-type folders', async () => {
        const res = await acquireAssets(samplePlan, deps, 2);
        assert.equal(res.candidates.length, 5);
        const imgs = res.candidates.filter((c: AssetCandidate) => c.kind === 'image');
        const vids = res.candidates.filter((c: AssetCandidate) => c.kind === 'video');
        const mus = res.candidates.filter((c: AssetCandidate) => c.kind === 'music');
        assert.equal(imgs.length, 2); // scene 2 is image, 2 candidates
        assert.equal(vids.length, 2); // scene 1 is video, 2 candidates
        assert.equal(mus.length, 1);
        assert.ok(fs.existsSync(vids[0].localPath));
        assert.ok(res.candidates[0].localPath.includes('assets'));
    });
});

// ── STAGE 3: verify (offline with fakes) ──────────────
describe('verify.ts', () => {
    test('passes good assets, fails missing files', async () => {
        const good = tmpFile('.jpg');
        const bad = tmpFile('.jpg');
        fs.writeFileSync(good, 'imgdata');
        const cands: AssetCandidate[] = [makeCandidate('image', 0, 1, good), makeCandidate('image', 0, 2, bad)];
        const wsStub: any = { root: os.tmpdir(), verificationDir: os.tmpdir() };
        const results = await verifyAll(cands, wsStub, {
            verifyImage: async (p: string) =>
                fs.existsSync(p)
                    ? { passes: true, confidence: 9, reason: 'matches' }
                    : { passes: false, confidence: 1, reason: 'missing' },
            verifyVideo: async () => ({ passes: true, confidence: 8, reason: '' }),
        });
        assert.equal(results.length, 2);
        assert.equal(results[0].passes, true);
        assert.equal(results[1].passes, false);
    });

    test('music check via music-verifier (no ffprobe => graceful pass on size)', async () => {
        const m = tmpFile('.mp3');
        fs.writeFileSync(m, Buffer.alloc(20 * 1024));
        const cands: AssetCandidate[] = [makeCandidate('music', -1, 1, m)];
        const results = await verifyAll(cands, { root: os.tmpdir(), verificationDir: os.tmpdir() } as any, {
            verifyImage: async () => ({ passes: true, confidence: 9, reason: '' }),
            verifyVideo: async () => ({ passes: true, confidence: 9, reason: '' }),
            ffprobe: () => null,
        });
        assert.equal(results[0].kind, 'music');
        assert.equal(results[0].passes, true);
    });

    test('VERIFY_PASS_CONFIDENCE is bounded 1..10', () => {
        assert.ok(VERIFY_PASS_CONFIDENCE >= 1 && VERIFY_PASS_CONFIDENCE <= 10);
    });
});

// ── STAGE 4+5: gateway + gate (agentic control) ───────
describe('gateway + gate.ts', () => {
    const deps: GatewayDeps = {
        fetchVisual: async (keywords: string[], kind: 'image' | 'video'): Promise<FetchedVisual[]> => {
            const ext = kind === 'image' ? '.jpg' : '.mp4';
            return [
                {
                    url: `http://x/${keywords[0]}_r${ext}`,
                    localPath: '',
                    source: 'fake',
                    license: 'CC0',
                    licenseUrl: 'http://lic',
                },
            ];
        },
        download: async (url: string, dir: string, filename: string) => {
            const p = path.join(dir, filename);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(p, 'dummy');
            return p;
        },
        fetchMusic: async (): Promise<FetchedVisual[]> => [
            { url: 'http://x/m.mp3', localPath: '', source: 'fake', license: 'CC0', licenseUrl: 'http://lic' },
        ],
        verifyImage: async () => ({ passes: true, confidence: 9, reason: 'ok' }),
        verifyVideo: async () => ({ passes: true, confidence: 9, reason: 'ok' }),
        decide: async (c: AssetCandidate) => ({ decision: 'approved', rationale: 'good enough' }),
        maxReplaceRetries: 1,
    };

    test('autonomous agent approves all and gate passes', async () => {
        const res = await acquireAssets(samplePlan, deps, 1);
        const { decisions, manifest } = await runGateway(samplePlan, res.candidates, deps);
        assert.equal(decisions.length, res.candidates.length);
        assert.ok(decisions.every((d: AssetDecision) => d.decision === 'approved'));
        assert.ok(manifest, 'render manifest should be built');

        const gate = runFinalGate(samplePlan, res.candidates, decisions, manifest);
        assert.equal(gate.pass, true, `gate failed: ${JSON.stringify(gate.checks)}`);
    });

    test('agent rejects a scene visual -> gate blocks render', async () => {
        const res = await acquireAssets(samplePlan, deps, 1);
        const rejectDeps: GatewayDeps = {
            ...deps,
            decide: async (c: AssetCandidate) =>
                c.kind !== 'music' && c.sceneIndex === 0
                    ? { decision: 'rejected', rationale: 'wrong subject' }
                    : { decision: 'approved', rationale: 'ok' },
        };
        const { decisions, manifest } = await runGateway(samplePlan, res.candidates, rejectDeps);
        const gate = runFinalGate(samplePlan, res.candidates, decisions, manifest);
        assert.equal(gate.pass, false, 'gate should block when a scene visual is rejected');
        const x2 = gate.checks.find((c: { id: string }) => c.id === 'X2');
        assert.equal(x2?.pass, false);
    });
});

// ── STAGE "agent is the AI" (no external model) ───────────────────────
describe('agent backend (no external AI)', () => {
    test('writes a script from a topic without any LLM', () => {
        const s = writeScriptHeuristic('Cats are great. They sleep all day. They love boxes.', 'Cats');
        assert.ok(s.includes('Cats'));
        assert.ok(s.split('\n').length >= 3);
    });

    test('expands keywords deterministically', () => {
        const scene = {
            sceneNumber: 1,
            voiceoverText: 'x',
            searchKeywords: ['gym'],
            visualPreference: 'video' as const,
            durationSec: 5,
        };
        const kw = expandKeywordsHeuristic(scene, 'Workout Tips');
        // Primary term preserved + context phrases added (no redundant "<kind> of <term>").
        assert.ok(kw.includes('gym'));
        assert.ok(kw.some((k) => k.includes('gym') && k !== 'gym'));
        // Deterministic: same input => same output.
        const kw2 = expandKeywordsHeuristic(scene, 'Workout Tips');
        assert.deepStrictEqual(kw, kw2);
        // No degenerate keyword that just repeats the media kind.
        assert.ok(!kw.some((k) => k.startsWith('video of ') || k.startsWith('image of ')));
    });

    test('agent approves a passing visual, replaces a failing one', () => {
        const good: AssetCandidate = {
            kind: 'image',
            sceneIndex: 0,
            candidateIndex: 1,
            localPath: 'a.jpg',
            url: 'u',
            source: 's',
            keywords: ['cat'],
        };
        const bad: AssetCandidate = {
            kind: 'image',
            sceneIndex: 1,
            candidateIndex: 1,
            localPath: 'b.jpg',
            url: 'u',
            source: 's',
            keywords: ['dog'],
        };
        const dGood = agentDecide({
            candidate: good,
            verification: {
                assetId: '',
                kind: 'image',
                sceneIndex: 0,
                passes: true,
                confidence: 9,
                reason: 'relevant',
            },
            approvedInScene: 0,
        });
        const dBad = agentDecide({
            candidate: bad,
            verification: {
                assetId: '',
                kind: 'image',
                sceneIndex: 1,
                passes: false,
                confidence: 2,
                reason: 'watermark',
            },
            approvedInScene: 0,
        });
        assert.equal(dGood.decision, 'approved');
        assert.equal(dBad.decision, 'replace');
        assert.ok(dBad.rationale.includes('watermark'));
    });

    test('agent approves passing music', () => {
        const m: AssetCandidate = {
            kind: 'music',
            sceneIndex: -1,
            candidateIndex: 1,
            localPath: 'a.mp3',
            url: '',
            source: 's',
            keywords: ['calm'],
        };
        const d = agentDecide({
            candidate: m,
            verification: {
                assetId: '',
                kind: 'music',
                sceneIndex: -1,
                passes: true,
                confidence: 8,
                reason: 'clean 30s',
            },
            approvedInScene: 0,
        });
        assert.equal(d.decision, 'approved');
    });
});

describe('writeScriptHeuristic — per-scene visual diversity', () => {
    test('each scene gets a DISTINCT [Visual: ...] keyword', () => {
        const script = writeScriptHeuristic('coffee', 'Coffee Facts');
        const visuals = script.match(/\[Visual:\s*([^\]]+)\]/g)?.map((v) => v.toLowerCase()) ?? [];
        assert.ok(visuals.length >= 3, 'expected >=3 scene visuals, got ' + visuals.length);
        const uniq = new Set(visuals);
        // At least 2 of the 3 scenes must differ (avoids the "all same image" bug).
        assert.ok(uniq.size >= 2, 'all scenes shared one visual keyword: ' + visuals.join(' | '));
    });

    test('multi-sentence topic also varies visuals per scene', () => {
        const script = writeScriptHeuristic(
            'Lions are apex predators. They hunt in prides. Cubs learn by playing.',
            'Lions',
        );
        const visuals = script.match(/\[Visual:\s*([^\]]+)\]/g) ?? [];
        assert.equal(visuals.length, 3);
        const uniq = new Set(visuals.map((v) => v.toLowerCase()));
        assert.ok(uniq.size >= 2, 'multi-sentence topic reused one visual: ' + visuals.join(' | '));
    });
});
