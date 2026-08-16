/**
 * captions-color.test.ts — Tests for caption styles and color grading.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Caption Styles ─────────────────────────────────────────────────────────

test('caption styles listCaptionStyles returns all styles', async () => {
    const { listCaptionStyles, getCaptionStyle } = await import('../src/agentic/services/captions/styles.js');
    const styles = listCaptionStyles();
    assert.ok(styles.length >= 5, 'has at least 5 styles');
    assert.ok(styles.includes('basic'), 'includes basic');
    assert.ok(styles.includes('typewriter'), 'includes typewriter');
    assert.ok(styles.includes('lowerthird'), 'includes lowerthird');
    assert.ok(styles.includes('karaoke'), 'includes karaoke');

    const basic = getCaptionStyle('basic');
    assert.equal(basic.name, 'Basic', 'basic style name');
    assert.equal(basic.animation, 'none', 'basic has no animation');
});

test('caption styles typewriter has animation', async () => {
    const { getCaptionStyle } = await import('../src/agentic/services/captions/styles.js');
    const style = getCaptionStyle('typewriter');
    assert.equal(style.animation, 'typewriter', 'typewriter animation');
});

test('caption styles generateAssStyle produces valid ASS', async () => {
    const { generateAssStyle } = await import('../src/agentic/services/captions/styles.js');
    const ass = generateAssStyle('basic', 1080, 1920);
    assert.ok(ass.includes('[Script Info]'), 'has script info');
    assert.ok(ass.includes('[V4+ Styles]'), 'has styles section');
    assert.ok(ass.includes('Default,'), 'has default style');
});

test('caption styles generateDrawtextFilter produces valid filter', async () => {
    const { generateDrawtextFilter } = await import('../src/agentic/services/captions/styles.js');
    const filter = generateDrawtextFilter('basic', 'Hello World', 1080, 1920);
    assert.ok(filter.includes('drawtext='), 'has drawtext');
    assert.ok(filter.includes('Hello World'), 'includes text');
    assert.ok(filter.includes('fontsize='), 'has fontsize');
});

// ─── Color Grading ──────────────────────────────────────────────────────────

test('color grading listColorPresets returns all presets', async () => {
    const { listColorPresets, getColorPreset } = await import('../src/lib/color-grading/presets.js');
    const presets = listColorPresets();
    assert.ok(presets.length >= 5, 'has at least 5 presets');
    assert.ok(presets.includes('cinematic'), 'includes cinematic');
    assert.ok(presets.includes('warm'), 'includes warm');
    assert.ok(presets.includes('noir'), 'includes noir');

    const cinematic = getColorPreset('cinematic');
    assert.equal(cinematic.name, 'Cinematic', 'cinematic name');
    assert.ok(cinematic.contrast && cinematic.contrast > 1, 'cinematic has contrast');
});

test('color grading generateEqFilter produces valid filter', async () => {
    const { generateEqFilter } = await import('../src/lib/color-grading/presets.js');
    const filter = generateEqFilter('cinematic');
    assert.ok(filter.includes('eq='), 'has eq filter');
    assert.ok(filter.includes('contrast='), 'has contrast');
});

test('color grading generateEqFilter returns empty for none', async () => {
    const { generateEqFilter } = await import('../src/lib/color-grading/presets.js');
    const filter = generateEqFilter('none');
    assert.equal(filter, '', 'returns empty for none');
});

test('color grading generateColorBalanceFilter works', async () => {
    const { generateColorBalanceFilter } = await import('../src/lib/color-grading/presets.js');
    const warm = generateColorBalanceFilter('warm');
    assert.ok(warm.includes('colorbalance='), 'has colorbalance');
    assert.ok(warm.includes('rs='), 'has red shift');
});

test('color grading generateColorGradeFilter chains filters', async () => {
    const { generateColorGradeFilter } = await import('../src/lib/color-grading/presets.js');
    const filter = generateColorGradeFilter('sunset');
    assert.ok(filter.length > 0, 'has filter');
});

test('color grading generateVignetteFilter works', async () => {
    const { generateVignetteFilter } = await import('../src/lib/color-grading/presets.js');
    const filter = generateVignetteFilter(1080, 1920);
    assert.ok(filter.includes('vignette='), 'has vignette');
});

test('color grading findLutFile returns null for missing LUT', async () => {
    const { findLutFile } = await import('../src/lib/color-grading/presets.js');
    const result = findLutFile('nonexistent-lut');
    assert.equal(result, null, 'returns null for missing LUT');
});

// ─── Voice Audition ─────────────────────────────────────────────────────────

test('voice audition getAllVoicesForAudition returns voices', async () => {
    const { getAllVoicesForAudition } = await import('../src/agentic/services/captions/audition.js');
    const voices = getAllVoicesForAudition();
    assert.ok(voices['edge-tts'] && voices['edge-tts'].length > 0, 'has edge-tts voices');
    assert.ok(voices['siliconflow'] && voices['siliconflow'].length > 0, 'has siliconflow voices');
});

test('voice audition cleanupPreviews does not throw', async () => {
    const { cleanupPreviews } = await import('../src/agentic/services/captions/audition.js');
    cleanupPreviews();
    assert.ok(true, 'cleanup ran without error');
});
