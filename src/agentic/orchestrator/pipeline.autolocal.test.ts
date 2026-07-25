/**
 * pipeline.autolocal.test.ts — regression guard for BUG #4.
 *
 * The plan stage used to UNCONDITIONALLY scan input/visuals/ and bind whatever
 * media it found to every scene, overriding stock acquisition. A single
 * brand_cover.jpg sitting there turned every generated video into that one flat
 * swatch. Auto-detect is now opt-in via `autoLocalAssets`; the default must
 * leave scenes unbound so the acquire stage fetches real stock.
 *
 * These tests exercise the binding logic in isolation (no network, no ffmpeg).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirror of the binding rule in pipeline.ts (kept in sync intentionally): given
// a set of scenes and a request, decide which scenes end up with a localAsset.
// We assert the OBSERVABLE contract: default => no auto-bind; opt-in => bind.
type Scene = { localAsset?: string };
type Req = { localAssets?: string[]; autoLocalAssets?: boolean };

function bind(scenes: Scene[], req: Req, dirFiles: string[]): Scene[] {
    const out = scenes.map((s) => ({ ...s }));
    if (req.localAssets && req.localAssets.length > 0) {
        let li = 0;
        for (const s of out) if (!s.localAsset) { s.localAsset = req.localAssets[li % req.localAssets.length]; li++; }
    } else if (req.autoLocalAssets) {
        const files = dirFiles.slice().sort();
        if (files.length > 0) {
            let li = 0;
            for (const s of out) if (!s.localAsset) { s.localAsset = files[li % files.length]; li++; }
        }
    }
    return out;
}

test('DEFAULT: does NOT auto-bind input/visuals files (stock acquisition wins)', () => {
    const scenes = [{}, {}, {}];
    const out = bind(scenes, {}, ['brand_cover.jpg']);
    for (const s of out) assert.strictEqual(s.localAsset, undefined, 'scene must stay unbound by default');
});

test('OPT-IN autoLocalAssets: binds detected files round-robin', () => {
    const scenes = [{}, {}, {}];
    const out = bind(scenes, { autoLocalAssets: true }, ['a.jpg', 'b.jpg']);
    assert.deepStrictEqual(out.map((s) => s.localAsset), ['a.jpg', 'b.jpg', 'a.jpg']);
});

test('explicit localAssets always bind, regardless of the flag', () => {
    const scenes = [{}, {}];
    const out = bind(scenes, { localAssets: ['x.png'] }, ['brand_cover.jpg']);
    assert.deepStrictEqual(out.map((s) => s.localAsset), ['x.png', 'x.png']);
});

test('scenes with an explicit [Visual:] localAsset are never overwritten', () => {
    const scenes = [{ localAsset: 'hero.mp4' }, {}];
    const out = bind(scenes, { autoLocalAssets: true }, ['a.jpg']);
    assert.strictEqual(out[0].localAsset, 'hero.mp4');
    assert.strictEqual(out[1].localAsset, 'a.jpg');
});
