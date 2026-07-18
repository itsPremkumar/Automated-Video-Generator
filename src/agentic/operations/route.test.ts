import { test, describe } from 'node:test';
import * as assert from 'node:assert/strict';
import { routeTask } from './route.js';
describe('route.ts intent classification (heuristic, no model)', () => {
  test('classifies merge', () => { const t = routeTask('merge a.mp4 and b.mp4 into one video'); assert.equal(t.kind, 'merge'); });
  test('classifies trim with times', () => { const t = routeTask('trim this clip from 10 to 20 seconds'); assert.equal(t.kind, 'trim'); assert.equal(t.args.start, 10); assert.equal(t.args.end, 20); });
  test('classifies crop to 9:16', () => { const t = routeTask('crop this video to 9:16 for tiktok'); assert.equal(t.kind, 'crop'); assert.equal(t.args.preset, '9:16'); });
  test('classifies resize', () => { const t = routeTask('resize this to 360x640'); assert.equal(t.kind, 'resize'); });
  test('classifies rotate', () => { const t = routeTask('rotate the clip 90 degrees'); assert.equal(t.kind, 'rotate'); assert.equal(t.args.deg, 90); });
  test('classifies extract audio', () => { const t = routeTask('extract audio from my video'); assert.equal(t.kind, 'extract_audio'); });
  test('classifies voiceover', () => { const t = routeTask('generate a voiceover of "welcome to my channel"'); assert.equal(t.kind, 'voiceover'); assert.ok((t.args.text||'').includes('welcome')); });
  test('classifies download image', () => { const t = routeTask('download an image of a coffee cup'); assert.equal(t.kind, 'download_image'); });
  test('classifies download video', () => { const t = routeTask('download a video of a city'); assert.equal(t.kind, 'download_video'); });
  test('classifies full video', () => { const t = routeTask('make a video about the benefits of morning walks'); assert.equal(t.kind, 'full_video'); });
});
