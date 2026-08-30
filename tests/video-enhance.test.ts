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

// ─── Update / Version Checker (consolidated 2026-08: update-checker.ts
//      was merged into version-checker.ts with backwards-compat aliases) ─

test('version-checker checkForUpdates is callable', async () => {
    const { checkForUpdates, getUpdateMessage } = await import('../src/agentic/services/version-checker.js');
    assert.ok(typeof checkForUpdates === 'function', 'checkForUpdates is function');
    assert.ok(typeof getUpdateMessage === 'function', 'getUpdateMessage is function');
    // UpdateInfo is exported as a type alias (type-only), preserved verbatim
    // from the old update-checker.ts API. Confirm getUpdateMessage works on
    // both the new (current/latest) shape and the legacy (currentVersion/
    // latestVersion) shape.
    const newShape = {
        hasUpdate: false, current: '5.0.0', latest: '5.0.0',
        releaseUrl: '', releaseNotes: '', publishedAt: '',
    };
    const legacyShape = {
        hasUpdate: true, currentVersion: '5.0.0', latestVersion: '6.0.0',
        releaseUrl: 'https://example.com/release', releaseNotes: '', publishedAt: '',
    };
    const a = getUpdateMessage(newShape as any);
    const b = getUpdateMessage(legacyShape as any);
    assert.ok(typeof a === 'string' && a.length > 0, 'getUpdateMessage works on new shape');
    assert.ok(typeof b === 'string' && b.includes('6.0.0'), 'getUpdateMessage works on legacy shape');
});

test('version-checker checkForUpdates returns valid structure', async () => {
    const { checkForUpdates } = await import('../src/agentic/services/version-checker.js');
    const result = await checkForUpdates();
    // Network may be down — accept either a fully-populated VersionInfo or null.
    if (result === null) return;
    assert.ok(typeof result.hasUpdate === 'boolean', 'hasUpdate is boolean');
    assert.ok(typeof result.current === 'string', 'current is string');
    assert.ok(typeof result.latest === 'string', 'latest is string');
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
