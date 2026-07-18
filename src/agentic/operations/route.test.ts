import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { routeTask, isChain } from './route.js';

/** Unwrap: a chain's first step is the classified single task for these prompts. */
function single(prompt: string) {
    const r = routeTask(prompt);
    if (isChain(r)) return r.chain[0];
    return r;
}

describe('route.ts intent classification (heuristic, no model)', () => {
    test('classifies merge', () => { const t = single('merge a.mp4 and b.mp4 into one video'); assert.equal(t.kind, 'merge'); });
    test('classifies trim with times', () => { const t = single('trim this clip from 10 to 20 seconds'); assert.equal(t.kind, 'trim'); assert.equal(t.args.start, 10); assert.equal(t.args.end, 20); });
    test('classifies crop to 9:16', () => { const t = single('crop this video to 9:16 for tiktok'); assert.equal(t.kind, 'crop'); assert.equal(t.args.preset, '9:16'); });
    test('classifies resize', () => { const t = single('resize this to 360x640'); assert.equal(t.kind, 'resize'); });
    test('classifies rotate', () => { const t = single('rotate the clip 90 degrees'); assert.equal(t.kind, 'rotate'); assert.equal(t.args.deg, 90); });
    test('classifies extract audio', () => { const t = single('extract audio from my video'); assert.equal(t.kind, 'extract_audio'); });
    test('classifies voiceover', () => { const t = single('generate a voiceover of "welcome to my channel"'); assert.equal(t.kind, 'voiceover'); assert.ok((t.args.text || '').includes('welcome')); });
    test('classifies download image', () => { const t = single('download an image of a coffee cup'); assert.equal(t.kind, 'download_image'); });
    test('classifies download video', () => { const t = single('download a video of a city'); assert.equal(t.kind, 'download_video'); });
    test('classifies full video', () => { const t = single('make a video about the benefits of morning walks'); assert.equal(t.kind, 'full_video'); });
    test('classifies split', () => { const t = single('split this into 3 parts'); assert.equal(t.kind, 'split'); });
    test('classifies add captions', () => { const t = single('add captions to my video'); assert.equal(t.kind, 'add_captions'); });
    test('classifies add music', () => { const t = single('add music to my video'); assert.equal(t.kind, 'add_music'); });
    test('classifies localize', () => { const t = single('translate to spanish'); assert.equal(t.kind, 'localize'); });
    test('classifies grade', () => { const t = single('apply cinematic grade'); assert.equal(t.kind, 'grade'); });
    test('classifies slow motion', () => { const t = single('slow motion this clip'); assert.equal(t.kind, 'slow_motion'); });
    test('classifies watermark', () => { const t = single('add watermark MyBrand'); assert.equal(t.kind, 'watermark'); });
    test('classifies lower third', () => { const t = single('add lower third Title'); assert.equal(t.kind, 'lower_third'); });
    test('classifies progress bar', () => { const t = single('add progress bar'); assert.equal(t.kind, 'progress_bar'); });
    test('classifies derive', () => { const t = single('make a square version'); assert.equal(t.kind, 'derive'); });
    test('detects 2-step chain', () => { const t = routeTask('crop to 9:16 then add music'); assert.ok(isChain(t)); assert.equal(t.chain.length, 2); });
});
