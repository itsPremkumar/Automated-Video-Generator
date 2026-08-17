/**
 * video-enhance.test.ts — Tests for speed ramp, progress bar, thumbnail, noise reduction.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Speed Ramp ──────────────────────────────────────────────────────────────

test('speed-ramp buildAtempoChain helper exists', async () => {
    const mod = await import('../src/lib/video/speed-ramp.js');
    assert.ok(mod.applySpeedChange, 'has applySpeedChange');
    assert.ok(mod.slowMotion, 'has slowMotion');
    assert.ok(mod.timeLapse, 'has timeLapse');
    assert.ok(mod.applySpeedRamp, 'has applySpeedRamp');
    assert.ok(mod.cinematicSlowMo, 'has cinematicSlowMo');
});

test('speed-ramp functions are callable', async () => {
    const { slowMotion, timeLapse } = await import('../src/lib/video/speed-ramp.js');
    assert.equal(typeof slowMotion, 'function', 'slowMotion is function');
    assert.equal(typeof timeLapse, 'function', 'timeLapse is function');
});

// ─── Progress Bar ────────────────────────────────────────────────────────────

test('progress-bar addProgressBar is callable', async () => {
    const { addProgressBar } = await import('../src/lib/video/progress-bar.js');
    assert.equal(typeof addProgressBar, 'function', 'addProgressBar is function');
});

// ─── Thumbnail Generator ────────────────────────────────────────────────────

test('thumbnail generateThumbnail is callable', async () => {
    const { generateThumbnail, generateThumbnailOptions } = await import('../src/agentic/services/enhance/thumbnail.js');
    assert.equal(typeof generateThumbnail, 'function', 'generateThumbnail is function');
    assert.equal(typeof generateThumbnailOptions, 'function', 'generateThumbnailOptions is function');
});

// ─── Noise Reduction ────────────────────────────────────────────────────────

test('noise-reduction reduceNoise is callable', async () => {
    const { reduceNoise, reduceVideoNoise } = await import('../src/agentic/services/enhance/noise-reduction.js');
    assert.equal(typeof reduceNoise, 'function', 'reduceNoise is function');
    assert.equal(typeof reduceVideoNoise, 'function', 'reduceVideoNoise is function');
});

// ─── Update Checker ─────────────────────────────────────────────────────────

test('update-checker checkForUpdates is callable', async () => {
    const { checkForUpdates, getUpdateMessage } = await import('../src/agentic/services/update-checker.js');
    assert.equal(typeof checkForUpdates, 'function', 'checkForUpdates is function');
    assert.equal(typeof getUpdateMessage, 'function', 'getUpdateMessage is function');
});

test('update-checker checkForUpdates returns valid structure', async () => {
    const { checkForUpdates } = await import('../src/agentic/services/update-checker.js');
    const result = await checkForUpdates();
    assert.ok(typeof result.hasUpdate === 'boolean', 'hasUpdate is boolean');
    assert.ok(result.currentVersion, 'has currentVersion');
    assert.ok(result.latestVersion, 'has latestVersion');
});

// ─── Script Templates ───────────────────────────────────────────────────────

test('scripts/templates getTemplate works', async () => {
    const { getTemplate, listNiches, generateScriptStructure } = await import('../src/agentic/services/scripts/templates.js');
    const tech = getTemplate('tech');
    assert.equal(tech.name, 'Tech Review', 'tech template name');
    assert.ok(tech.structure.length > 0, 'has structure');

    const niches = listNiches();
    assert.ok(niches.length >= 5, 'has at least 5 niches');

    const structure = generateScriptStructure('tech', 'AI');
    assert.ok(structure.length > 0, 'generates structure');
});

test('scripts/templates all niches have valid templates', async () => {
    const { listNiches, getTemplate } = await import('../src/agentic/services/scripts/templates.js');
    const niches = listNiches();
    for (const niche of niches) {
        const template = getTemplate(niche);
        assert.ok(template.name, `${niche} has name`);
        assert.ok(template.structure.length > 0, `${niche} has structure`);
        assert.ok(template.suggestedDuration > 0, `${niche} has duration`);
    }
});
