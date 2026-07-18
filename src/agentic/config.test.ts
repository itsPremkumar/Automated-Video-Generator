import assert from 'node:assert';
import { test } from 'node:test';
import {
    resolveConfig,
    listTemplates,
    VIDEO_TYPE_PROFILES,
    VIDEO_TYPE_LABELS,
    CAPTION_THEME_PRESETS,
    VIDEO_FORMAT_PRESETS,
    resolveCaptionTheme,
    captionThemeToDrawtext,
    listCaptionThemes,
    listFormats,
} from './config.js';
import type { VideoType } from './config.js';

test('resolveConfig applies a videoType template on top of the preset', () => {
    const cfg = resolveConfig({ topic: 't', videoType: 'news' });
    // news template forces landscape 16:9 + cut + no kinetic text
    assert.strictEqual(cfg.orientation, 'landscape');
    assert.strictEqual(cfg.aspect, '16:9');
    assert.strictEqual(cfg.transition, 'cut');
    assert.strictEqual(cfg.kineticText, false);
    // pro-edit feel from the template
    assert.strictEqual(cfg.hookFirst, false);
    assert.strictEqual(cfg.variablePacing, false);
});

test('explicit user overrides win over template', () => {
    const cfg = resolveConfig({ topic: 't', videoType: 'news', aspect: '1:1', kineticText: true });
    assert.strictEqual(cfg.aspect, '1:1'); // user override beats news 16:9
    assert.strictEqual(cfg.kineticText, true); // user override beats news false
    // non-overridden template fields still apply
    assert.strictEqual(cfg.transition, 'cut');
});

test('template carries genre-specific pro-edit feel', () => {
    const facts = resolveConfig({ topic: 't', videoType: 'facts' });
    const nature = resolveConfig({ topic: 't', videoType: 'nature' });
    assert.strictEqual(facts.hookFirst, true);
    assert.ok((facts.jCutSec ?? 0) > 0);
    // nature leads gently (no hook-first) with a longer J-cut
    assert.strictEqual(nature.hookFirst, false);
    assert.ok((nature.jCutSec ?? 0) >= 0.8);
});

test('all 7 templates have a label and are listed', () => {
    const ids = Object.keys(VIDEO_TYPE_PROFILES) as VideoType[];
    assert.strictEqual(ids.length, 7);
    for (const id of ids) assert.ok(VIDEO_TYPE_LABELS[id], `missing label for ${id}`);
    const listed = listTemplates();
    assert.strictEqual(listed.length, 7);
    assert.ok(listed.every((t) => t.label.length > 0));
});

test('unknown videoType falls back to empty template (no crash)', () => {
    const cfg = resolveConfig({ topic: 't', videoType: 'facts' as VideoType });
    assert.ok(cfg.aspect); // still resolves hard defaults
});

test('video-format preset overrides orientation + aspect', () => {
    const shorts = resolveConfig({ topic: 't', format: 'shorts' });
    assert.strictEqual(shorts.orientation, 'portrait');
    assert.strictEqual(shorts.aspect, '9:16');

    const square = resolveConfig({ topic: 't', format: 'square' });
    assert.strictEqual(square.orientation, 'portrait');
    assert.strictEqual(square.aspect, '1:1');

    const explainer = resolveConfig({ topic: 't', format: 'explainer' });
    assert.strictEqual(explainer.orientation, 'landscape');
    assert.strictEqual(explainer.aspect, '16:9');

    // explicit orientation override still wins over the format preset
    const override = resolveConfig({ topic: 't', format: 'shorts', orientation: 'landscape' });
    assert.strictEqual(override.orientation, 'landscape');
});

test('caption theme presets are all valid and resolvable', () => {
    const ids = Object.keys(CAPTION_THEME_PRESETS);
    assert.ok(ids.length >= 4);
    for (const id of ids) {
        const t = resolveCaptionTheme(id);
        assert.ok(t.color.startsWith('#'));
        assert.ok(['bottom', 'center', 'top'].includes(t.position));
        assert.ok(t.fontScale > 0);
    }
    // unknown name falls back to minimal
    assert.strictEqual(resolveCaptionTheme('nope').position, 'bottom');
    // listers return every preset
    assert.strictEqual(listCaptionThemes().length, ids.length);
    assert.strictEqual(listFormats().length, Object.keys(VIDEO_FORMAT_PRESETS).length);
});

test('captionThemeToDrawtext maps theme fields to ffmpeg drawtext args', () => {
    // minimal: white, no box, bottom, default size
    const min = captionThemeToDrawtext(resolveCaptionTheme('minimal'));
    assert.strictEqual(min.fontcolor, '0xFFFFFF');
    assert.strictEqual(min.fontsize, 30); // 30 * 1.0
    assert.strictEqual(min.boxArgs, ''); // bg null -> no box
    assert.strictEqual(min.yExpr, 'h-text_h-120');

    // highContrast: yellow, boxed (alpha 0.55), bottom, size 33 (30*1.1)
    const hc = captionThemeToDrawtext(resolveCaptionTheme('highContrast'));
    assert.strictEqual(hc.fontcolor, '0xFFFF00');
    assert.strictEqual(hc.fontsize, 33);
    assert.ok(hc.boxArgs.includes('box=1'));
    assert.ok(hc.boxArgs.includes('black@0.55'));

    // centerPop: centered, larger (30*1.2 = 36), no box
    const cp = captionThemeToDrawtext(resolveCaptionTheme('centerPop'));
    assert.strictEqual(cp.yExpr, '(h-text_h)/2');
    assert.strictEqual(cp.fontsize, 36);

    // topTag: top-anchored
    const tt = captionThemeToDrawtext(resolveCaptionTheme('topTag'));
    assert.strictEqual(tt.yExpr, '120');

    // custom base size scales
    const scaled = captionThemeToDrawtext(resolveCaptionTheme('bold'), 40);
    assert.strictEqual(scaled.fontsize, 46); // round(40 * 1.15)
});
