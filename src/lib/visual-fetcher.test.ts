import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    calculateSafeTrimAfterFrames,
    estimateVideoDurationFromSize,
    getQualityRank,
    normalizeKeywordList,
    parseFrameRate,
    parseGeminiKeywordResponse,
    parsePositiveInteger,
    parsePositiveNumber,
    selectBestVideoFile,
    sortVideoAssets,
    type MediaAsset,
} from './visual-fetcher';

// ---------------------------------------------------------------------------
// Pure numeric parsers
// ---------------------------------------------------------------------------

test('parsePositiveNumber accepts finite positive numbers, rejects the rest', () => {
    assert.equal(parsePositiveNumber(5), 5);
    assert.equal(parsePositiveNumber(0), undefined);
    assert.equal(parsePositiveNumber(-3), undefined);
    assert.equal(parsePositiveNumber(Number.NaN), undefined);
    assert.equal(parsePositiveNumber(Infinity), undefined);
});

test('parsePositiveNumber parses numeric strings', () => {
    assert.equal(parsePositiveNumber('12.5'), 12.5);
    assert.equal(parsePositiveNumber('-1'), undefined);
    assert.equal(parsePositiveNumber('abc'), undefined);
    assert.equal(parsePositiveNumber(''), undefined);
});

test('parsePositiveInteger floors and rejects non-positive / non-numeric', () => {
    assert.equal(parsePositiveInteger(7.9), 7);
    assert.equal(parsePositiveInteger('10'), 10);
    assert.equal(parsePositiveInteger(0), undefined);
    assert.equal(parsePositiveInteger(-1), undefined);
    assert.equal(parsePositiveInteger('nope'), undefined);
});

test('parseFrameRate handles plain fps and "num/den" fractions', () => {
    assert.equal(parseFrameRate('30'), 30);
    assert.equal(parseFrameRate('30000/1001'), 30000 / 1001);
    assert.equal(parseFrameRate('0/0'), undefined); // divide-by-zero guard
    assert.equal(parseFrameRate(''), undefined);
    assert.equal(parseFrameRate('garbage'), undefined);
    assert.equal(parseFrameRate(30 as unknown), undefined); // non-string
});

// ---------------------------------------------------------------------------
// Duration / trim math
// ---------------------------------------------------------------------------

test('calculateSafeTrimAfterFrames trims the end buffer', () => {
    // 6s * 30fps = 180 frames, minus SAFE_VIDEO_END_BUFFER_FRAMES (15) => 165
    assert.equal(calculateSafeTrimAfterFrames(6, 30), 165);
    // Never below 1 even for tiny durations.
    assert.equal(calculateSafeTrimAfterFrames(0.1, 30), 1);
    // Default fps applies when omitted.
    assert.equal(calculateSafeTrimAfterFrames(5), Math.max(1, 150 - 15));
});

test('estimateVideoDurationFromSize derives a bounded estimate from file size', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-est-'));
    const file = path.join(dir, 'clip.mp4');
    // 20 MB => 20 * 0.5 = 10s, clamped to [3, 30].
    fs.writeFileSync(file, Buffer.alloc(20 * 1024 * 1024));
    const est = estimateVideoDurationFromSize(file);
    assert.ok(est !== undefined);
    assert.equal(est, 10);
});

test('estimateVideoDurationFromSize returns undefined for missing file', () => {
    assert.equal(estimateVideoDurationFromSize(path.join(os.tmpdir(), 'does-not-exist-xyz.mp4')), undefined);
});

// ---------------------------------------------------------------------------
// Quality selection + sorting
// ---------------------------------------------------------------------------

test('getQualityRank orders PREFERRED_QUALITIES and pushes unknowns last', () => {
    assert.equal(getQualityRank('hd'), 0);
    assert.equal(getQualityRank('uhd'), 1);
    assert.equal(getQualityRank('sd'), 2);
    assert.equal(getQualityRank('weird'), Number.MAX_SAFE_INTEGER);
    assert.equal(getQualityRank(undefined), Number.MAX_SAFE_INTEGER);
});

const makeVideo = (quality: string, width: number, height: number): any => ({
    quality,
    width,
    height,
    url: `https://x/${quality}`,
});

test('selectBestVideoFile prefers preferred quality among valid (>= MIN_WIDTH) files', () => {
    const files = [makeVideo('sd', 1280, 720), makeVideo('hd', 1920, 1080), makeVideo('uhd', 3840, 2160)];
    assert.equal(selectBestVideoFile(files)!.quality, 'hd'); // hd ranks first
});

test('selectBestVideoFile ignores sub-MIN_WIDTH files, then falls back to widest', () => {
    const files = [makeVideo('hd', 480, 270), makeVideo('sd', 1280, 720), makeVideo('uhd', 640, 360)];
    // All preferred qualities are < MIN_WIDTH(720) except sd(1280); hd/uhd too small.
    assert.equal(selectBestVideoFile(files)!.quality, 'sd');
});

test('selectBestVideoFile returns the first file when none meet MIN_WIDTH', () => {
    const files = [makeVideo('hd', 200, 100), makeVideo('sd', 100, 50)];
    assert.equal(selectBestVideoFile(files)!.width, 200);
});

test('selectBestVideoFile handles empty input defensively', () => {
    assert.equal(selectBestVideoFile([]), undefined);
});

test('sortVideoAssets prefers duration closest to TARGET (6s) then larger pixel area', () => {
    const a: MediaAsset = { type: 'video', url: 'a', width: 1920, height: 1080, videoDuration: 6 };
    const b: MediaAsset = { type: 'video', url: 'b', width: 1280, height: 720, videoDuration: 12 };
    const c: MediaAsset = { type: 'video', url: 'c', width: 1920, height: 1080, videoDuration: 3 };
    const sorted = sortVideoAssets([b, c, a]);
    assert.equal(sorted[0].url, 'a'); // 6s exact target, wins
    assert.equal(sorted[1].url, 'c'); // 3s closer than 12s
    assert.equal(sorted[2].url, 'b');
});

// ---------------------------------------------------------------------------
// Keyword parsing (Gemini response robustness)
// ---------------------------------------------------------------------------

test('normalizeKeywordList dedupes, trims, drops non-strings, caps at 3', () => {
    assert.deepEqual(normalizeKeywordList(['sunset', ' Sunset ', 'ocean', 'forest', 'mountain']), [
        'sunset',
        'ocean',
        'forest',
    ]);
    assert.deepEqual(normalizeKeywordList(['  lone  ']), ['lone']);
    assert.deepEqual(normalizeKeywordList('not-array'), []);
    assert.deepEqual(normalizeKeywordList([1, null, 'valid']), ['valid']);
});

test('parseGeminiKeywordResponse handles bare JSON array', () => {
    const out = parseGeminiKeywordResponse('["sunset","ocean","mountain"]');
    assert.deepEqual(out, ['sunset', 'ocean', 'mountain']);
});

test('parseGeminiKeywordResponse strips ```json fences', () => {
    const text = '```json\n["sunset", "ocean"]\n```';
    assert.deepEqual(parseGeminiKeywordResponse(text), ['sunset', 'ocean']);
});

test('parseGeminiKeywordResponse extracts an array when extra prose surrounds it', () => {
    const text = 'Here are keywords: ["sunset", "ocean", "forest"] hope that helps';
    assert.deepEqual(parseGeminiKeywordResponse(text), ['sunset', 'ocean', 'forest']);
});

test('parseGeminiKeywordResponse returns [] on unparseable input', () => {
    assert.deepEqual(parseGeminiKeywordResponse('no keywords here'), []);
    assert.deepEqual(parseGeminiKeywordResponse(''), []);
});
