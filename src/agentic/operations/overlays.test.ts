import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOverlayPlan, resolveCaptionTheme, CAPTION_THEMES } from './overlays';

test('captionTheme resolves a preset and overrides fontColor', () => {
    const p = buildOverlayPlan({ captionTheme: 'neon', fontColor: 'white' });
    assert.equal(p.font.color, CAPTION_THEMES.neon.color); // 0x39ff14
    assert.equal(p.font.weight, 800);
    assert.equal(p.font.shadow, true);
    assert.equal(p.captionTheme, 'neon');
});

test('unknown captionTheme falls back to default (no crash)', () => {
    const p = buildOverlayPlan({ captionTheme: 'does-not-exist' });
    assert.equal(p.font.color, CAPTION_THEMES.default.color);
});

test('explicit fontColor wins when no captionTheme', () => {
    const p = buildOverlayPlan({ fontColor: 'yellow', fontWeight: 900 });
    assert.equal(p.font.color, 'yellow');
    assert.equal(p.font.weight, 900);
});

test('resolveCaptionTheme returns default for undefined', () => {
    assert.deepEqual(resolveCaptionTheme(undefined), CAPTION_THEMES.default);
    assert.equal(resolveCaptionTheme('BOLD').weight, 800);
});
