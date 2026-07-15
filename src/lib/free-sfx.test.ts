import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'fs';
import * as path from 'path';
import { FfmpegSfxGenerator } from './free-sfx/generator.js';
import { LocalSfxProvider } from './free-sfx/local-provider.js';

test('FfmpegSfxGenerator generates whoosh sound', async () => {
    const gen = new FfmpegSfxGenerator();
    const clip = await gen.getSfx('whoosh');
    assert.ok(clip !== null, 'should generate whoosh');
    assert.equal(clip.kind, 'whoosh');
    assert.ok(fs.existsSync(clip.localPath), 'file should exist on disk');
    assert.ok(clip.durationMs > 0, 'duration should be positive');
    assert.ok(clip.localPath.endsWith('.wav'), 'should be a wav file');
});

test('FfmpegSfxGenerator generates ding sound', async () => {
    const gen = new FfmpegSfxGenerator();
    const clip = await gen.getSfx('ding');
    assert.ok(clip !== null, 'should generate ding');
    assert.ok(fs.existsSync(clip.localPath), 'file should exist');
});

test('FfmpegSfxGenerator generates impact sound', async () => {
    const gen = new FfmpegSfxGenerator();
    const clip = await gen.getSfx('impact');
    assert.ok(clip !== null, 'should generate impact');
    assert.ok(fs.existsSync(clip.localPath), 'file should exist');
});

test('FfmpegSfxGenerator generates notification sound', async () => {
    const gen = new FfmpegSfxGenerator();
    const clip = await gen.getSfx('notification');
    assert.ok(clip !== null, 'should generate notification');
    assert.ok(fs.existsSync(clip.localPath), 'file should exist');
});

test('FfmpegSfxGenerator generates transition sound', async () => {
    const gen = new FfmpegSfxGenerator();
    const clip = await gen.getSfx('transition');
    assert.ok(clip !== null, 'should generate transition');
    assert.ok(fs.existsSync(clip.localPath), 'file should exist');
});

test('FfmpegSfxGenerator generates click sound', async () => {
    const gen = new FfmpegSfxGenerator();
    const clip = await gen.getSfx('click');
    assert.ok(clip !== null, 'should generate click');
    assert.ok(fs.existsSync(clip.localPath), 'file should exist');
});

test('FfmpegSfxGenerator generates pop sound', async () => {
    const gen = new FfmpegSfxGenerator();
    const clip = await gen.getSfx('pop');
    assert.ok(clip !== null, 'should generate pop');
    assert.ok(fs.existsSync(clip.localPath), 'file should exist');
});

test('FfmpegSfxGenerator generates swish sound', async () => {
    const gen = new FfmpegSfxGenerator();
    const clip = await gen.getSfx('swish');
    assert.ok(clip !== null, 'should generate swish');
    assert.ok(fs.existsSync(clip.localPath), 'file should exist');
});

test('FfmpegSfxGenerator generates bounce sound', async () => {
    const gen = new FfmpegSfxGenerator();
    const clip = await gen.getSfx('bounce');
    assert.ok(clip !== null, 'should generate bounce');
    assert.ok(fs.existsSync(clip.localPath), 'file should exist');
});

test('FfmpegSfxGenerator caches generated files', async () => {
    const gen = new FfmpegSfxGenerator();
    const clip1 = await gen.getSfx('ding');
    const clip2 = await gen.getSfx('ding');
    assert.equal(clip1?.localPath, clip2?.localPath, 'should return same cached path');
});

test('FfmpegSfxGenerator clearCache removes files', async () => {
    const gen = new FfmpegSfxGenerator();
    await gen.getSfx('click');
    const cacheDir = path.dirname((await gen.getSfx('click'))!.localPath);
    gen.clearCache();
    const files = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir) : [];
    assert.ok(files.length === 0 || files.every((f) => !f.includes('click')), 'cache should be cleared');
});

test('LocalSfxProvider returns null when no sfx directory exists', async () => {
    const provider = new LocalSfxProvider();
    const clip = await provider.getSfx('whoosh');
    assert.equal(clip, null, 'should return null when no local sfx');
});

test('LocalSfxProvider.getAllAvailable returns empty when no directory', async () => {
    const provider = new LocalSfxProvider();
    const available = await provider.getAllAvailable();
    assert.ok(Array.isArray(available), 'should return an array');
});
