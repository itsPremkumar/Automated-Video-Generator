import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    generatePerspectiveJobs,
    PERSPECTIVES,
    PERSPECTIVE_SCRIPTS,
    topicKeywords,
    isPerspectiveKind,
} from './perspective-generator.js';

test('topicKeywords strips stopwords and caps at 4 words', () => {
    const kw = topicKeywords('How volcanoes shape the Earth over time');
    assert.ok(kw.length <= 4);
    assert.ok(!kw.includes('the'));
    assert.ok(kw.includes('volcanoes'));
});

test('every perspective template produces a distinct multi-line script with visual tags', () => {
    const scripts = PERSPECTIVES.map((k) => PERSPECTIVE_SCRIPTS[k]('how volcanoes shape the earth', 'Volcano Power').script);
    // all non-empty, multi-line, tagged
    for (const s of scripts) {
        assert.ok(s.split('\n').length >= 4, 'script has >=4 lines');
        assert.ok(/\[Visual: /.test(s), 'script carries [Visual:] tags');
    }
    // all DISTINCT (the whole point of perspectives)
    const uniq = new Set(scripts);
    assert.equal(uniq.size, scripts.length);
});

test('generatePerspectiveJobs: default produces 5 jobs with stable unique ids', async () => {
    const jobs = await generatePerspectiveJobs('how volcanoes shape the Earth', 'Volcano Power');
    assert.equal(jobs.length, 5);
    const ids = new Set(jobs.map((j) => j.id));
    assert.equal(ids.size, 5);
    for (const j of jobs) {
        assert.ok(j.id!.startsWith('persp_'));
        assert.ok(j.script && j.script.length > 100);
        assert.equal(j.hookFirst, true);
        assert.ok(j.tags?.includes('perspective-test'));
    }
});

test('generatePerspectiveJobs: subset selection respects requested angles', async () => {
    const jobs = await generatePerspectiveJobs('black holes', 'Into the Dark', {
        perspectives: ['myths', 'mechanism'],
    });
    assert.equal(jobs.length, 2);
    const titles = jobs.map((j) => j.title).join('|');
    assert.match(titles, /Myths vs facts/);
    assert.match(titles, /How it works/);
});

test('isPerspectiveKind guards the union', () => {
    assert.equal(isPerspectiveKind('history'), true);
    assert.equal(isPerspectiveKind('banana'), false);
});
