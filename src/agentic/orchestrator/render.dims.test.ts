/**
 * render.dims.test.ts — regression guard for BUG #7.
 *
 * The agentic batch renderer (renderAgenticSlideshow) used to ignore the
 * job's `orientation`/`aspect` and ALWAYS render 720x1280 (portrait).
 * So a `square` (1:1) job came out letterboxed portrait. `resolveRenderDims`
 * now mirrors compose.ts so the canonical W×H matches the request.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRenderDims } from './render.js';

test('square aspect → 1:1 (720x720)', () => {
    assert.deepEqual(resolveRenderDims(undefined, '1:1'), { w: 720, h: 720 });
    assert.deepEqual(resolveRenderDims('square', undefined), { w: 720, h: 720 });
    assert.deepEqual(resolveRenderDims(undefined, 'square'), { w: 720, h: 720 });
});

test('landscape orientation/aspect → 16:9 (1280x720)', () => {
    assert.deepEqual(resolveRenderDims('landscape', undefined), { w: 1280, h: 720 });
    assert.deepEqual(resolveRenderDims(undefined, '16:9'), { w: 1280, h: 720 });
});

test('portrait / 9:16 → 720x1280', () => {
    assert.deepEqual(resolveRenderDims('portrait', undefined), { w: 720, h: 1280 });
    assert.deepEqual(resolveRenderDims(undefined, '9:16'), { w: 720, h: 1280 });
});

test('explicit aspect wins over orientation', () => {
    // square orientation but 16:9 aspect requested → aspect wins
    assert.deepEqual(resolveRenderDims('square', '16:9'), { w: 1280, h: 720 });
});

test('no hints → portrait default 720x1280', () => {
    assert.deepEqual(resolveRenderDims(undefined, undefined), { w: 720, h: 1280 });
});
