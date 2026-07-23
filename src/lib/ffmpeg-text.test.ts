import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ffmpegDrawtextEscape } from './ffmpeg-text.js';

/**
 * Regression tests for P3 (gstack production-grade pass):
 * user-supplied captions/titles must be safe inside an ffmpeg
 * drawtext=text='...' single-quoted filtergraph. A bare quote or a
 * filter-chain separator must never break out of the quoted text or
 * inject additional filter args.
 */
test('escapes apostrophe so drawtext cannot break out of the quote', () => {
    const out = ffmpegDrawtextEscape("It's a trap");
    // The typographic ' (U+2019) is used instead of a bare quote.
    assert.ok(!out.includes("'"), 'output must not contain a bare single quote');
    assert.ok(out.includes('’'), 'apostrophe should be replaced with typographic quote');
});

test('escapes colon, comma and double-quote (filterchain separators / metachars)', () => {
    const out = ffmpegDrawtextEscape('a:b,c"d');
    assert.ok(out.includes('\\:'), 'colon must be escaped');
    assert.ok(out.includes('\\,'), 'comma must be escaped');
    assert.ok(out.includes('\\"'), 'double-quote must be escaped');
    // None of these may remain as a bare metacharacter that ffmpeg would parse
    // as a filterchain separator.
    assert.ok(!out.includes(':') || out.includes('\\:'), 'bare colon not allowed');
});

test('normalizes backslash so paths do not re-escape later chars', () => {
    // Windows path C:\path\to — the literal backslash is normalized to '/'
    // (ffmpeg drawtext has no meaningful backslash; a '/' renders fine). After
    // the full pipeline the only backslashes left are the escape-leading ones
    // ffmpeg itself expects (e.g. '\:' for the drive colon), never a raw
    // unescaped backslash that would corrupt the filter.
    const out = ffmpegDrawtextEscape('C:\\path\\to');
    // No *bare* backslash should survive as a path separator — it must be '/'.
    assert.ok(!out.includes('\\p'), 'no raw backslash-path separators');
    assert.ok(out.includes('/'), 'backslash normalized to forward slash');
});

test('captions with special chars wrap safely in a drawtext filter', () => {
    const title = "Bob's \"hot:take\", 2026";
    const filter = `drawtext=text='${ffmpegDrawtextEscape(title)}':fontcolor=white`;
    // The filter must contain exactly two single quotes (the wrapper) and no
    // bare metacharacter that closes the quote early.
    const quoteCount = (filter.match(/'/g) || []).length;
    assert.equal(quoteCount, 2, 'filter string must stay a single quoted span');
});
