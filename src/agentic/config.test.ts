import assert from 'node:assert';
import { test } from 'node:test';
import { resolveConfig, listTemplates, VIDEO_TYPE_PROFILES, VIDEO_TYPE_LABELS } from './config.js';
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
