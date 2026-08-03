import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { needsComplexScriptShaping, buildLibassCaptionFilter, resolveCaptionFont } from '../../../src/agentic/operations/compose.js';

test('needsComplexScriptShaping detects Indic/Arabic scripts', () => {
    assert.equal(needsComplexScriptShaping('நீர் அருந்துவது நல்லது'), true, 'Tamil');
    assert.equal(needsComplexScriptShaping('यह एक परीक्षण है'), true, 'Devanagari');
    assert.equal(needsComplexScriptShaping('هذا اختبار'), true, 'Arabic');
    assert.equal(needsComplexScriptShaping('Water is good for you'), false, 'Latin');
    assert.equal(needsComplexScriptShaping('水是最好的'), false, 'CJK needs no shaping');
});

test('buildLibassCaptionFilter writes a timed ASS and returns subtitles filter', () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avs-libass-'));
    const filter = buildLibassCaptionFilter('நீர் அருந்துவது', {
        size: 48, color: 'white', workDir, idx: 7, pos: 'bottom',
    });
    // Returns a subtitles= filter referencing the written ASS.
    assert.match(filter, /^subtitles='/);
    assert.match(filter, /fontsdir='/);
    const m = filter.match(/subtitles='([^']+)'/);
    assert.ok(m, 'ASS path captured');
    const assPath = m![1];
    assert.ok(fs.existsSync(assPath), 'ASS file was written');
    const ass = fs.readFileSync(assPath, 'utf-8');
    // The ASS must contain the (UTF-8) Tamil text and a Dialogue line.
    assert.ok(ass.includes('நீர் அருந்துவது'), 'ASS contains the Tamil caption text');
    assert.match(ass, /Dialogue: 0,/);
    // fontsdir must point at the bundled-fonts directory.
    const fd = filter.match(/fontsdir='([^']+)'/)![1];
    assert.ok(fs.existsSync(path.join(fd, 'NotoSansTamil-Regular.ttf')), 'fontsdir has the bundled Tamil font');
    fs.rmSync(workDir, { recursive: true, force: true });
});

test('resolveCaptionFont picks the Tamil font for Tamil text', () => {
    const f = resolveCaptionFont('நீர்');
    assert.ok(f && f.includes('NotoSansTamil'), `expected Tamil font, got ${f}`);
});
