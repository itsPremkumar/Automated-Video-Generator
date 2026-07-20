/**
 * enhancements.test.ts — unit tests for the pure logic in the new Remotion
 * enhancement components (no React rendering required; validates the helpers
 * that drive the visuals so a regression is caught without a Chrome render).
 */
import assert from 'node:assert';
import { test } from 'node:test';
import { secondsToFrames, presentationFor, timingFor } from './transitions.js';
import { CAPTION_STYLES } from './caption-styles.js';
import { interpolatePath } from '@remotion/paths';
import { makeStar, makeCircle } from '@remotion/shapes';

test('secondsToFrames rounds to at least 1 frame', () => {
    assert.equal(secondsToFrames(2, 30), 60);
    assert.equal(secondsToFrames(0.01, 30), 1); // never zero
});

test('presentationFor returns a component + props for every kind', () => {
    for (const k of ['fade', 'slide', 'circleWipe', 'flip'] as const) {
        const p = presentationFor(k);
        assert.equal(typeof p.component, 'function', `${k} component`);
        assert.deepEqual(p.props, {});
    }
});

test('timingFor returns a timing object', () => {
    const t = timingFor('fade');
    assert.ok(t && typeof t === 'object', 'timing present');
    const ts = timingFor('circleWipe', true);
    assert.ok(ts && typeof ts === 'object', 'springy timing present');
});

test('CAPTION_STYLES covers all 6 variants', () => {
    assert.deepEqual(
        [...CAPTION_STYLES].sort(),
        ['fire', 'glitch', 'glow', 'neon', 'pop', 'typewriter'].sort(),
    );
});

test('interpolatePath produces valid SVG path strings at endpoints', () => {
    const a = 'M 50 0 C 77 0 100 23 100 50 C 100 77 77 100 50 100 C 23 100 0 77 0 50 C 0 23 23 0 50 0 Z';
    const b = 'M 50 5 L 61 38 L 95 38 L 67 59 L 78 92 L 50 71 L 22 92 L 33 59 L 5 38 L 39 38 Z';
    const at0 = interpolatePath(0, a, b);
    const at1 = interpolatePath(1, a, b);
    assert.ok(at0.includes('M'), 'start path valid');
    assert.ok(at1.includes('L'), 'end path (star) valid');
    assert.notEqual(at0, at1, 'morph changes the path');
});

test('@remotion/shapes generators produce SVG path data', () => {
    const star = makeStar({ points: 5, innerRadius: 20, outerRadius: 50, edgeRoundness: 0 });
    const circle = makeCircle({ radius: 50 });
    assert.ok(typeof star.path === 'string' && star.path.startsWith('M'), 'star path');
    assert.ok(typeof circle.path === 'string' && circle.path.startsWith('M'), 'circle path');
});
