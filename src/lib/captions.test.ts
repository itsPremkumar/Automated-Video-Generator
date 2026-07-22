import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { makeWorkspaceTempDir, resolveWorkspaceTempPath } from '../shared/runtime/paths.js';
const __WS_TEST_TMP__ = resolveWorkspaceTempPath('tests');
import {
    activeSegmentAt,
    buildFallbackSegments,
    buildGlobalCaptions,
    DEFAULT_CAPTION_FORMAT,
    DEFAULT_SUBTITLE_MODE,
    deriveGlobalCaptions,
    deriveSceneCaptions,
    parseEdgeTtsSubtitles,
    serializeCaptions,
    serializeCaptionsToSrt,
    serializeCaptionsToVtt,
    syllableWordTimings,
    writeCaptionSidecars,
    type CaptionSegment,
} from './captions';

const sampleSrt = `1
00:00:00,000 --> 00:00:01,200
Hello world

2
00:00:01,200 --> 00:00:03,000
This is a test
`;

test('parseEdgeTtsSubtitles parses Edge-TTS SRT into scene-relative segments', () => {
    const dir = makeWorkspaceTempDir('cap-');
    const file = path.join(dir, 'scene_1_voice.srt');
    fs.writeFileSync(file, sampleSrt, 'utf8');

    const segments = parseEdgeTtsSubtitles(file);
    assert.ok(segments, 'expected non-null segments');
    assert.equal(segments!.length, 2);
    assert.equal(segments![0].text, 'Hello world');
    assert.equal(segments![0].startMs, 0);
    assert.equal(segments![0].endMs, 1200);
    assert.equal(segments![1].text, 'This is a test');
    assert.equal(segments![1].startMs, 1200);
    assert.equal(segments![1].endMs, 3000);

    fs.rmSync(dir, { recursive: true, force: true });
});

test('parseEdgeTtsSubtitles returns null for missing / empty / unparseable file (offline fallback)', () => {
    // Missing file
    assert.equal(parseEdgeTtsSubtitles(path.join(__WS_TEST_TMP__, 'does-not-exist.srt')), null);

    // Empty file
    const dir = makeWorkspaceTempDir('cap-');
    const empty = path.join(dir, 'empty.srt');
    fs.writeFileSync(empty, '   \n  ', 'utf8');
    assert.equal(parseEdgeTtsSubtitles(empty), null);

    // Unparseable garbage
    const garbage = path.join(dir, 'garbage.srt');
    fs.writeFileSync(garbage, 'not an srt file at all', 'utf8');
    assert.equal(parseEdgeTtsSubtitles(garbage), null);

    fs.rmSync(dir, { recursive: true, force: true });
});

test('buildFallbackSegments builds a single full-scene cue', () => {
    const segs = buildFallbackSegments('Whole scene text', 4.5);
    assert.equal(segs.length, 1);
    assert.equal(segs[0].text, 'Whole scene text');
    assert.equal(segs[0].startMs, 0);
    assert.equal(segs[0].endMs, 4500);

    // Empty/blank text yields no segments
    assert.deepEqual(buildFallbackSegments('', 3), []);
    assert.deepEqual(buildFallbackSegments('   ', 3), []);

    // Sub-second durations clamp to a minimum cue length
    const short = buildFallbackSegments('x', 0.1);
    assert.ok(short[0].endMs >= 500);
});

test('activeSegmentAt returns the cue active at a given offset and clamps at tail', () => {
    const segs: CaptionSegment[] = [
        { text: 'a', startMs: 0, endMs: 1000 },
        { text: 'b', startMs: 1000, endMs: 2000 },
    ];
    assert.deepEqual(activeSegmentAt(segs, 500), segs[0]);
    assert.deepEqual(activeSegmentAt(segs, 1500), segs[1]);
    // Past the final cue -> clamp to last
    assert.deepEqual(activeSegmentAt(segs, 5000), segs[1]);
    // Empty -> null
    assert.equal(activeSegmentAt([], 100), null);
    assert.equal(activeSegmentAt(undefined, 100), null);
});

test('buildGlobalCaptions offsets per-scene cues onto the global timeline', () => {
    const scenes = [
        { startMs: 0, segments: buildFallbackSegments('scene one', 2) },
        { startMs: 2000, segments: [{ text: 'scene two', startMs: 0, endMs: 1500 }] },
        // Scene with no segments and no fallback text -> contributes nothing
        { startMs: 3500, fallbackText: '', durationSeconds: 1 },
    ];
    const captions = buildGlobalCaptions(scenes);
    assert.equal(captions.length, 2);
    // Scene one cue starts at 0
    assert.equal(captions[0].startMs, 0);
    assert.equal(captions[0].endMs, 2000);
    // Scene two cue offset by 2000ms
    assert.equal(captions[1].startMs, 2000);
    assert.equal(captions[1].endMs, 3500);
});

test('serializeCaptionsToSrt produces valid SRT with timecodes', () => {
    const captions = buildGlobalCaptions([
        { startMs: 0, segments: buildFallbackSegments('First', 2) },
        { startMs: 2000, segments: [{ text: 'Second', startMs: 0, endMs: 1500 }] },
    ]);
    const srt = serializeCaptionsToSrt(captions);
    assert.match(srt, /1\s*\n00:00:00,000 --> 00:00:02,000/);
    assert.match(srt, /2\s*\n00:00:02,000 --> 00:00:03,500/);
    assert.ok(srt.includes('First') && srt.includes('Second'));
});

test('serializeCaptionsToVtt produces valid WebVTT with timecodes', () => {
    const captions = buildGlobalCaptions([{ startMs: 0, segments: buildFallbackSegments('First', 2) }]);
    const vtt = serializeCaptionsToVtt(captions);
    assert.ok(vtt.startsWith('WEBVTT'));
    assert.match(vtt, /00:00:00\.000 --> 00:00:02\.000/);
    assert.ok(vtt.includes('First'));
});

test('serializeCaptions dispatches on format and handles empty input', () => {
    const captions = buildGlobalCaptions([{ startMs: 0, segments: buildFallbackSegments('Only', 1) }]);
    assert.ok(serializeCaptions(captions, 'srt').includes('00:00:00,000'));
    assert.ok(serializeCaptions(captions, 'vtt').startsWith('WEBVTT'));
    assert.equal(serializeCaptions([], 'srt'), '');
    assert.equal(serializeCaptions([], 'vtt'), 'WEBVTT\n\n');
});

test('defaults are burned subtitle mode and srt caption format', () => {
    assert.equal(DEFAULT_SUBTITLE_MODE, 'burned');
    assert.equal(DEFAULT_CAPTION_FORMAT, 'srt');
});

test('deriveSceneCaptions sentence mode produces one cue spanning the scene', () => {
    const cues = deriveSceneCaptions({ text: 'Hello world', durationSeconds: 4 }, 'sentence');
    assert.equal(cues.length, 1);
    assert.equal(cues[0].text, 'Hello world');
    assert.equal(cues[0].startMs, 0);
    assert.equal(cues[0].endMs, 4000);
});

test('deriveSceneCaptions word mode splits text per-word across the duration', () => {
    const cues = deriveSceneCaptions({ text: 'one two three', durationSeconds: 3 }, 'word');
    assert.equal(cues.length, 3);
    assert.equal(cues[0].text, 'one');
    assert.equal(cues[2].text, 'three');
    assert.equal(cues[0].startMs, 0);
    assert.equal(cues[2].endMs, 3000);
    for (let i = 1; i < cues.length; i++) {
        assert.equal(cues[i].startMs, cues[i - 1].endMs);
    }
});

test('deriveSceneCaptions returns [] for empty text', () => {
    assert.deepEqual(deriveSceneCaptions({ text: '', durationSeconds: 2 }), []);
});

test('deriveGlobalCaptions accumulates scene start offsets across scenes', () => {
    const caps = deriveGlobalCaptions(
        [
            { text: 'Scene one', durationSeconds: 2 },
            { text: 'Scene two', durationSeconds: 3 },
        ],
        'sentence',
    );
    assert.equal(caps.length, 2);
    assert.equal(caps[0].startMs, 0);
    assert.equal(caps[0].endMs, 2000);
    assert.equal(caps[1].startMs, 2000);
    assert.equal(caps[1].endMs, 5000);
});

test('writeCaptionSidecars writes srt + vtt next to the MP4 and returns paths', () => {
    const dir = makeWorkspaceTempDir('capside-');
    const written = writeCaptionSidecars(
        dir,
        [
            { text: 'First line', durationSeconds: 2 },
            { text: 'Second line', durationSeconds: 2 },
        ],
        { mode: 'sentence' },
    );
    assert.equal(written.length, 2);
    const srt = path.join(dir, 'subtitles.srt');
    const vtt = path.join(dir, 'subtitles.vtt');
    assert.ok(fs.existsSync(srt));
    assert.ok(fs.existsSync(vtt));
    assert.match(fs.readFileSync(vtt, 'utf8'), /WEBVTT/);
    assert.match(fs.readFileSync(srt, 'utf8'), /00:00:00,000 --> 00:00:02,000/);
});

test('writeCaptionSidecars writes nothing when no scene has text', () => {
    const dir = makeWorkspaceTempDir('capside-');
    const written = writeCaptionSidecars(dir, [{ text: '', durationSeconds: 2 }]);
    assert.deepEqual(written, []);
    assert.equal(fs.existsSync(path.join(dir, 'subtitles.srt')), false);
});

test('syllableWordTimings produces word-by-word cues filling the duration', () => {
    const segs = syllableWordTimings('The quick brown fox jumps', 4000);
    assert.equal(segs.length, 5);
    // first word starts at 0, last word ends at/after the audio duration
    assert.equal(segs[0].startMs, 0);
    assert.ok(segs[segs.length - 1].endMs >= 4000 - 1);
    // monotonic + non-overlapping
    for (let i = 1; i < segs.length; i++) {
        assert.ok(segs[i].startMs >= segs[i - 1].endMs);
    }
    // every word is preserved as its own cue text
    assert.deepEqual(
        segs.map((s) => s.text),
        ['The', 'quick', 'brown', 'fox', 'jumps'],
    );
});

test('syllableWordTimings returns empty for blank text', () => {
    assert.deepEqual(syllableWordTimings('   ', 1000), []);
});
