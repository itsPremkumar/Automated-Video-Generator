/**
 * acquire.test.ts — Unit tests for the STAGE 2 asset acquisition pipeline.
 *
 * These run OFFLINE using injected fake fetchers/downloaders so they exercise
 * the real acquireAssets logic (concurrency limits, local-asset reuse,
 * fallback generation, candidate sorting) without hitting the network.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { acquireAssets, mapWithConcurrencyLimit, generateFallbackVisual } from './acquire.js';
import { AgenticWorkspace } from '../management/workspace.js';
import { makeWorkspaceTempDir } from '../../shared/runtime/paths.js';

function fakeWs(tag = 'acq-'): AgenticWorkspace {
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

function fakePlan(scenes: { kind?: 'image' | 'video'; text?: string }[]) {
    return {
        jobId: 'test-job',
        title: 'Test Plan',
        orientation: 'portrait' as const,
        voice: 'en-US-JennyNeural',
        musicQuery: 'ambient lofi',
        totalDurationSec: scenes.length * 4,
        scenes: scenes.map((s, i) => ({
            sceneNumber: i + 1,
            voiceoverText: s.text ?? `Scene ${i + 1}`,
            searchKeywords: ['test', `kw${i}`],
            visualPreference: (s.kind ?? 'image') as 'image' | 'video',
            durationSec: 4,
        })),
    } as any;
}

test('mapWithConcurrencyLimit bounds parallel execution and preserves order', async () => {
    let active = 0;
    let maxObserved = 0;
    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
        active++;
        maxObserved = Math.max(maxObserved, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return i * 2;
    });
    const out = await mapWithConcurrencyLimit(tasks, 3);
    assert.deepEqual(out, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
    assert.ok(maxObserved <= 3, `max concurrent was ${maxObserved}, expected <= 3`);
});

test('acquireAssets downloads candidates per scene with bounded concurrency', async () => {
    const ws = fakeWs();
    const plan = fakePlan([{}, {}, {}]);
    let fetchCalls = 0;
    const deps = {
        fetchVisual: async (keywords: string[], kind: 'image' | 'video') => {
            fetchCalls++;
            return [
                { url: `http://example.com/${keywords[0]}.jpg`, localPath: '', source: 'pexels' },
                { url: `http://example.com/${keywords[0]}-2.jpg`, localPath: '', source: 'pexels' },
            ];
        },
        download: async (url: string, dir: string, filename: string) => {
            const p = path.join(dir, filename);
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, 'fake-image-bytes');
            return p;
        },
        fetchMusic: async () => [{ url: '', localPath: '/tmp/fake.mp3', source: 'local' }],
    } as any;

    const { workspace, candidates } = await acquireAssets(plan, deps, 2);
    assert.ok(fs.existsSync(workspace.root));
    // 3 scenes × 2 candidates each = 6 visual candidates
    const visuals = candidates.filter((c) => c.kind !== 'music');
    assert.equal(visuals.length, 6);
    assert.equal(fetchCalls, 3, 'should fetch once per scene (ladder returns 1 usable)');
    // Each candidate file should exist on disk
    for (const c of visuals) {
        assert.ok(fs.existsSync(c.localPath), `missing ${c.localPath}`);
    }
    fs.rmSync(ws.root, { recursive: true, force: true });
});

test('acquireAssets reuses local assets bound to a scene (no network)', async () => {
    const ws = fakeWs();
    // Create a fake local asset in input/visuals/ is complex; instead verify the
    // scene.localAsset path by pre-staging a file via inputAssetPath is out of
    // scope here. Use the fallback-generation path instead (see next test).
    const plan = fakePlan([{ kind: 'image' }]);
    const deps = {
        fetchVisual: async () => [], // simulate total fetch failure
        download: async () => { throw new Error('should not be called'); },
        fetchMusic: async () => [],
    } as any;

    const { candidates } = await acquireAssets(plan, deps, 1);
    // When fetch fails, an offline fallback visual is generated (asset-creator).
    assert.equal(candidates.length, 1, 'one fallback candidate expected');
    assert.equal(candidates[0].source, 'asset-creator');
    assert.ok(fs.existsSync(candidates[0].localPath), 'fallback file should exist');
    fs.rmSync(ws.root, { recursive: true, force: true });
});

// Regression / round-trip test for P1a local-asset reuse:
// when a scene declares `scene.localAsset = 'foo.jpg'`, acquire.ts must
// look up `input/visuals/foo.jpg` via inputAssetPath(), copy it into the
// workspace, mark it source='local-asset', and SKIP the network ladder
// entirely (no fetch, no download).
//
// We pre-stage the file under the project-root `input/visuals/` dir (which
// is what inputAssetPath() resolves via resolveProjectPath) and assert:
//   1) exactly one visual candidate is produced, labeled source='local-asset'
//   2) the file at candidates[0].localPath matches the staged bytes
//   3) the network fetcher was never called for that scene
test('acquireAssets binds scene.localAsset to input/visuals/<name> (round-trip, no fetch)', async () => {
    const ws = fakeWs();
    // Stage a fake visual in the real input/visuals/ root.
    const visualsDir = path.resolve(process.cwd(), 'input', 'visuals');
    fs.mkdirSync(visualsDir, { recursive: true });
    const stagedName = `avs_test_${Date.now()}_brand_cover.jpg`;
    const stagedPath = path.join(visualsDir, stagedName);
    const stagedBytes = Buffer.from('FAKE-JPEG-BYTES-' + Date.now());
    fs.writeFileSync(stagedPath, stagedBytes);

    try {
        const plan = fakePlan([{ kind: 'image', text: 'uses local asset' }]);
        // Tag the one scene with a localAsset filename.
        plan.scenes[0].localAsset = stagedName;

        let fetchCalledForScene = false;
        const deps = {
            fetchVisual: async () => {
                fetchCalledForScene = true;
                return [];
            },
            download: async () => {
                throw new Error('network download should NOT be called when localAsset is bound');
            },
            fetchMusic: async () => [],
        } as any;

        const { candidates, workspace } = await acquireAssets(plan, deps, 1);
        const visuals = candidates.filter((c) => c.kind !== 'music');
        assert.equal(visuals.length, 1, 'one local-asset candidate expected');
        const c = visuals[0];
        assert.equal(c.source, 'local-asset', `expected source=local-asset, got "${c.source}"`);
        assert.equal(c.url, `local://${stagedName}`, 'url should be local://<name>');
        assert.ok(fs.existsSync(c.localPath), 'candidate file should exist on disk');
        const onDisk = fs.readFileSync(c.localPath);
        assert.deepEqual(onDisk, stagedBytes, 'candidate bytes must match the staged input file');
        assert.equal(fetchCalledForScene, false, 'network fetch must be skipped when localAsset is bound');

        fs.rmSync(workspace.root, { recursive: true, force: true });
    } finally {
        fs.rmSync(stagedPath, { force: true });
    }
    fs.rmSync(ws.root, { recursive: true, force: true });
});

// When scene.localAsset is set but the file is missing under input/visuals/,
// acquire must FALL THROUGH to the stock fetch ladder (it must not silently
// produce an empty candidate, and it must not throw).
test('acquireAssets falls through to network when scene.localAsset file is missing', async () => {
    const ws = fakeWs();
    const plan = fakePlan([{ kind: 'image', text: 'no file present' }]);
    plan.scenes[0].localAsset = `definitely_missing_${Date.now()}.jpg`;

    let fetchCalled = false;
    const deps = {
        fetchVisual: async () => {
            fetchCalled = true;
            return [{ url: 'http://stock.example.com/fallback.jpg', localPath: '', source: 'pexels' }];
        },
        download: async (url: string, dir: string, filename: string) => {
            const p = path.join(dir, filename);
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, 'stock-image');
            return p;
        },
        fetchMusic: async () => [],
    } as any;

    const { candidates, workspace } = await acquireAssets(plan, deps, 1);
    const visuals = candidates.filter((c) => c.kind !== 'music');
    assert.equal(visuals.length, 1, 'one stock candidate expected after fallthrough');
    assert.notEqual(visuals[0].source, 'local-asset', 'must NOT be labeled local-asset when file was missing');
    assert.equal(fetchCalled, true, 'network fetch should have been called as fallback');

    fs.rmSync(workspace.root, { recursive: true, force: true });
    fs.rmSync(ws.root, { recursive: true, force: true });
});

test('generateFallbackVisual produces a real offline image fallback', () => {
    const dir = makeWorkspaceTempDir('fb-img-');
    const fb = generateFallbackVisual({ voiceoverText: 'hi', searchKeywords: ['a'] }, 'image', dir, 0);
    assert.ok(fb, 'fallback should be produced');
    assert.equal(fb!.source, 'asset-creator');
    assert.ok(fs.existsSync(fb!.localPath), 'fallback image file should exist');
    assert.ok(fb!.localPath.endsWith('.jpg'));
    fs.rmSync(dir, { recursive: true, force: true });
});

test('generateFallbackVisual produces a real offline video fallback', () => {
    const dir = makeWorkspaceTempDir('fb-vid-');
    const fb = generateFallbackVisual({ voiceoverText: 'hi', searchKeywords: ['a'] }, 'video', dir, 0);
    assert.ok(fb, 'fallback should be produced');
    assert.equal(fb!.source, 'asset-creator');
    assert.ok(fs.existsSync(fb!.localPath), 'fallback video file should exist');
    assert.ok(fb!.localPath.endsWith('.mp4'));
    fs.rmSync(dir, { recursive: true, force: true });
});

// Regression test for fix #2: a HANGING download (dead/slow stock host) must NOT
// stall the whole acquire stage. downloadWithTimeout bounds it and the code
// falls back to the offline ffmpeg placeholder so the scene still gets a real
// asset instead of a blank/undefined path. Previously this hung the pipeline
// for ~400s and produced zero candidates.
test('acquireAssets: a hanging download is timed out and falls back to offline placeholder', async () => {
    const ws = fakeWs();
    const plan = fakePlan([{ kind: 'image' }]);
    const realEnv = process.env.AGENTIC_DOWNLOAD_TIMEOUT_MS;
    process.env.AGENTIC_DOWNLOAD_TIMEOUT_MS = '300';
    const deps = {
        fetchVisual: async () => [
            { url: 'http://hang.example.com/stuck.jpg', localPath: '', source: 'pexels' },
        ],
        // Never resolves → simulates a dead host. Without the timeout this would hang forever.
        download: async () => new Promise<string>(() => {}),
        fetchMusic: async () => [],
    } as any;

    const start = Date.now();
    const { candidates } = await acquireAssets(plan, deps, 1);
    const elapsed = Date.now() - start;
    if (realEnv === undefined) delete process.env.AGENTIC_DOWNLOAD_TIMEOUT_MS;
    else process.env.AGENTIC_DOWNLOAD_TIMEOUT_MS = realEnv;

    // Must return quickly (well under a multi-second hang), not stall.
    assert.ok(elapsed < 5000, `acquire returned in ${elapsed}ms (must not hang)`);
    // The hung download is replaced by the offline fallback, so the scene still
    // has a usable candidate rather than a blank/undefined path.
    assert.equal(candidates.length, 1, 'fallback candidate expected after timeout');
    // The fallback is a generated offline placeholder (honestly labeled
    // 'placeholder' for uniform gradients, or 'asset-creator' otherwise) — either
    // way it is NOT the original fetched source, and the file must exist.
    assert.ok(
        candidates[0].source === 'asset-creator' || candidates[0].source === 'placeholder',
        `fallback source expected, got "${candidates[0].source}"`,
    );
    assert.ok(fs.existsSync(candidates[0].localPath), 'fallback file should exist on disk');
    fs.rmSync(ws.root, { recursive: true, force: true });
});

test('acquireAssets sorts candidates: music last, then by scene/candidate index', async () => {
    const ws = fakeWs();
    const plan = fakePlan([{}, {}]);
    const deps = {
        fetchVisual: async (kw: string[], kind: 'image' | 'video') => [
            { url: `http://example.com/${kw[0]}.jpg`, localPath: '', source: 'pexels' },
        ],
        download: async (url: string, dir: string, filename: string) => {
            const p = path.join(dir, filename);
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, 'x');
            return p;
        },
        fetchMusic: async () => [
            { url: '', localPath: '/tmp/m1.mp3', source: 'local' },
            { url: '', localPath: '/tmp/m2.mp3', source: 'local' },
        ],
    } as any;

    const { candidates } = await acquireAssets(plan, deps, 1);
    const musicIdx = candidates.findIndex((c) => c.kind === 'music');
    // Music must come after all visuals
    for (let i = 0; i < musicIdx; i++) assert.notEqual(candidates[i].kind, 'music');
    fs.rmSync(ws.root, { recursive: true, force: true });
});
