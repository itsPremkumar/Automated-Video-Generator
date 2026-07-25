/**
 * wave-scheduler.filename.test.ts — regression guard for BUG #3.
 *
 * A raw job title like "WAVE A: zoomblur (landscape)" was used directly as the
 * output .mp4 filename. On Windows the ':' is illegal, so ffmpeg truncated the
 * path at the colon and wrote a 0-byte "WAVE A" file — a silent corruption the
 * batch reported as success. sanitizeVideoFilename() strips the forbidden
 * characters while keeping the title human-readable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeVideoFilename } from './wave-scheduler.js';

const ILLEGAL = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];

test('strips every Windows-illegal character', () => {
    const out = sanitizeVideoFilename('WAVE A: zoomblur + highContrast (landscape)');
    for (const ch of ILLEGAL) assert.ok(!out.includes(ch), `must not contain ${ch}: ${out}`);
    // still readable
    assert.ok(out.includes('WAVE A'), out);
    assert.ok(out.includes('zoomblur'), out);
});

test('the exact bug title no longer truncates to "WAVE A"', () => {
    const out = sanitizeVideoFilename('WAVE A: zoomblur transitions + highContrast theme (landscape)');
    assert.notStrictEqual(out, 'WAVE A');
    assert.ok(out.length > 'WAVE A'.length, out);
});

test('em-dash / emoji-ish titles survive, control chars removed', () => {
    const out = sanitizeVideoFilename('WAVE H: square stack — palette+progress');
    for (const ch of ILLEGAL) assert.ok(!out.includes(ch), out);
    assert.ok(out.includes('—'), 'em dash is legal and kept: ' + out);
});

test('falls back to id when the title sanitizes to empty', () => {
    assert.strictEqual(sanitizeVideoFilename(':::', 'job_123'), 'job_123');
    assert.strictEqual(sanitizeVideoFilename(undefined, 'job_123'), 'job_123');
    assert.strictEqual(sanitizeVideoFilename('', 'job_123'), 'job_123');
});

test('no trailing dot or space (Windows silently strips them, breaking paths)', () => {
    assert.ok(!sanitizeVideoFilename('My Video.').endsWith('.'));
    assert.ok(!sanitizeVideoFilename('My Video ').endsWith(' '));
});

test('caps length at 120 chars', () => {
    assert.ok(sanitizeVideoFilename('x'.repeat(400)).length <= 120);
});
