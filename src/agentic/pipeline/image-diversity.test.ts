/**
 * image-diversity.test.ts — IMAGE improvements: relevance re-rank +
 * cross-scene visual dedupe in the gateway manifest.
 *
 * Failing case that motivated this: every scene approved the same top-hit
 * stock photo, so the render showed one image 3x (slideshow tell).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { buildRenderManifest, scoreWithRelevance } from './gateway.js';
import { acquireAssets } from './acquire.js';
import { makeWorkspaceTempDir } from '../../shared/runtime/paths.js';
import { visualDedupeKey } from '../timeline/visual-intel.js';
import type { AssetCandidate, AssetDecision, Plan } from '../types.js';

function plan(n: number): Plan {
    return {
        jobId: 'div_test',
        title: 'Diversity Test',
        orientation: 'portrait',
        voice: 'v',
        musicQuery: 'calm',
        totalDurationSec: n * 4,
        scenes: Array.from({ length: n }, (_, i) => ({
            sceneNumber: i + 1,
            voiceoverText: `scene ${i + 1} about octopus ocean`,
            searchKeywords: ['octopus', 'ocean'],
            visualPreference: 'image' as const,
            durationSec: 4,
        })),
    };
}

function cand(sceneIndex: number, candidateIndex: number, url: string, localPath: string): AssetCandidate {
    return {
        kind: 'image',
        sceneIndex,
        candidateIndex,
        localPath,
        url,
        source: 'pexels',
        license: 'pexels',
        keywords: ['octopus', 'ocean'],
    };
}

function approved(c: AssetCandidate): AssetDecision {
    return {
        assetId: `${c.kind}_s${c.sceneIndex}_c${c.candidateIndex}`,
        kind: c.kind,
        sceneIndex: c.sceneIndex,
        decision: 'approved',
        rationale: 'test',
        decidedBy: 'agent',
        fallbackUsed: false,
    };
}

const ws = { jobId: 'div_test', root: '/tmp/div_test' } as never;

describe('image diversity in gateway manifest', () => {
    it('picks distinct visuals across scenes when alternates exist', () => {
        const dup = 'https://images.pexels.com/photos/1?a=1';
        const alt = 'https://images.pexels.com/photos/2';
        const cands = [
            cand(0, 0, dup, '/a/pool_one.jpg'),
            cand(1, 0, dup, '/a/pool_one.jpg'),
            cand(1, 1, alt, '/a/pool_two.jpg'),
        ];
        const decisions = cands.map(approved);
        const scores = new Map([
            ['image_s0_c0', 15],
            ['image_s1_c0', 15],
            ['image_s1_c1', 12],
        ]);
        const m = buildRenderManifest(plan(2), cands, decisions, ws, scores)!;
        assert.ok(m);
        assert.equal(m.assets[0].localPath, '/a/pool_one.jpg');
        // Scene 1 must NOT repeat scene 0's photo even though it scores higher.
        assert.equal(m.assets[1].localPath, '/a/pool_two.jpg');
    });

    it('never blocks: repeats best pick when no alternate exists', () => {
        const dup = 'https://images.pexels.com/photos/9';
        const cands = [cand(0, 0, dup, '/a/same.jpg'), cand(1, 0, dup, '/a/same.jpg')];
        const m = buildRenderManifest(plan(2), cands, cands.map(approved), ws)!;
        assert.ok(m);
        assert.equal(m.assets.length, 2);
        assert.equal(m.assets[1].localPath, '/a/same.jpg');
    });

    it('keeps best-first order when every scene is already distinct', () => {
        const cands = [cand(0, 0, 'https://img/x/1', '/a/one.jpg'), cand(0, 1, 'https://img/x/2', '/a/two.jpg')];
        const scores = new Map([
            ['image_s0_c0', 5],
            ['image_s0_c1', 9],
        ]);
        const m = buildRenderManifest(plan(1), cands, cands.map(approved), ws, scores)!;
        assert.equal(m.assets[0].localPath, '/a/two.jpg');
    });

    it('still returns null when a scene has zero approved visuals', () => {
        const cands = [cand(0, 0, 'https://img/x/1', '/a/one.jpg')];
        const m = buildRenderManifest(plan(2), cands, cands.map(approved), ws);
        assert.equal(m, null);
    });

    it('scoreWithRelevance rewards on-topic keywords within a +3 bound', () => {
        const onTopic = scoreWithRelevance(10, ['octopus', 'ocean'], ['octopus deep ocean']);
        const offTopic = scoreWithRelevance(10, ['octopus', 'ocean'], ['city car night']);
        assert.ok(onTopic > offTopic);
        assert.ok(onTopic - 10 <= 3.0001);
        assert.equal(scoreWithRelevance(10, [], []), 10);
    });

    it('visualDedupeKey collides for same photo under signed URLs', () => {
        const a = visualDedupeKey('https://cdn.com/p/1.jpg?sig=aaa&w=800', '/ws/scene_01_pool_one.jpg');
        const b = visualDedupeKey('https://cdn.com/p/1.jpg?sig=bbb&w=400', '/ws/scene_02_pool_one.jpg');
        const c = visualDedupeKey('https://cdn.com/p/2.jpg', '/ws/scene_02_pool_two.jpg');
        assert.equal(a, b);
        assert.notEqual(a, c);
    });

    it('acquireAssets downloads distinct top picks per scene (same top hit)', async () => {
        // Regression: provider returns the identical top hit for every scene.
        // Scene 1's fetch resolves FIRST (concurrency) — index order must still
        // win, so scene 0 claims the top hit and scene 1 falls to the spare.
        const dup = 'http://example.com/dedupe-shared.jpg';
        const alt = 'http://example.com/dedupe-spare.jpg';
        const mk = (url: string) => ({ url, localPath: '', source: 'pexels', license: 'pexels' });
        const deps = {
            fetchVisual: async (_kw: string[], _kind: 'image' | 'video', _o: string, sceneIndex = 0) => {
                if (sceneIndex === 0) await new Promise((r) => setTimeout(r, 30));
                return [mk(dup), mk(alt)];
            },
            download: async (url: string, dir: string, filename: string) => {
                const p = path.join(dir, filename);
                fs.mkdirSync(path.dirname(p), { recursive: true });
                fs.writeFileSync(p, `bytes-for-${url}`);
                return p;
            },
            fetchMusic: async () => [],
        } as never;
        const p = plan(2);
        (p as { jobId: string }).jobId = `div_acq_${Date.now()}`;
        const { candidates } = await acquireAssets(p, deps, 1);
        const visuals = candidates.filter((c) => c.kind !== 'music');
        assert.equal(visuals.length, 2);
        const firstUrl = (si: number): string => visuals.find((c) => c.sceneIndex === si)!.url;
        assert.equal(firstUrl(0), dup);
        assert.equal(firstUrl(1), alt);
        // End-to-end of the two layers: manifest also resolves distinct files.
        const decisions = visuals.map((c) => ({
            assetId: `${c.kind}_s${c.sceneIndex}_c${c.candidateIndex}`,
            kind: c.kind,
            sceneIndex: c.sceneIndex,
            decision: 'approved' as const,
            rationale: 'test',
            decidedBy: 'agent' as const,
            fallbackUsed: false,
        }));
        const m = buildRenderManifest(p, visuals, decisions, { root: makeWorkspaceTempDir('div-') } as never)!;
        assert.ok(m);
        assert.notEqual(m.assets[0].localPath, m.assets[1].localPath);
    });
});
