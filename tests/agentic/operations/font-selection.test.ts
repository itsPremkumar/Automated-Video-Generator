/**
 * Font selection: ensures captions pick the right bundled Noto font per
 * script (Latin / Tamil / Devanagari / CJK) and that the bundled font files
 * actually exist on disk. Guards the "no tofu boxes + headless-safe captions"
 * fix.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { resolveCaptionFont } from '../../../src/agentic/operations/compose.js';

const fontsDir = path.join(process.cwd(), 'assets', 'fonts');

describe('resolveCaptionFont (bundled, script-aware)', () => {
  it('returns a real bundled Latin font for ASCII text', () => {
    const f = resolveCaptionFont('Stay hydrated every day');
    assert.ok(f, 'expected a bundled font path');
    assert.ok(fs.existsSync(f!), `Latin font missing: ${f}`);
    assert.ok(f!.endsWith('NotoSans-Regular.ttf'));
  });

  it('selects Tamil Noto for Tamil script', () => {
    const f = resolveCaptionFont('நீர் அருந்துவது நல்லது');
    assert.ok(f, 'expected a Tamil font path');
    assert.ok(fs.existsSync(f!), `Tamil font missing: ${f}`);
    assert.ok(f!.endsWith('NotoSansTamil-Regular.ttf'));
  });

  it('selects Devanagari Noto for Hindi script', () => {
    const f = resolveCaptionFont('पानी पीना जरूरी है');
    assert.ok(f, 'expected a Devanagari font path');
    assert.ok(fs.existsSync(f!), `Devanagari font missing: ${f}`);
    assert.ok(f!.endsWith('NotoSansDevanagari-Regular.ttf'));
  });

  it('selects CJK Noto for Chinese script', () => {
    const f = resolveCaptionFont('喝水很重要');
    assert.ok(f, 'expected a CJK font path');
    assert.ok(fs.existsSync(f!), `CJK font missing: ${f}`);
    assert.ok(f!.endsWith('NotoSansSC-Regular.otf'));
  });

  it('all four bundled font files are present in assets/fonts', () => {
    for (const name of [
      'NotoSans-Regular.ttf',
      'NotoSansTamil-Regular.ttf',
      'NotoSansDevanagari-Regular.ttf',
      'NotoSansSC-Regular.otf',
    ]) {
      assert.ok(fs.existsSync(path.join(fontsDir, name)), `missing bundled font: ${name}`);
    }
  });
});
