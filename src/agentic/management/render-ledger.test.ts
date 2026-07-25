/**
 * render-ledger.test.ts — proves the L3 learning store records outcomes and
 * primes future renders, using a temp ledger under workspace/tmp (never system
 * TEMP, per containment rule).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { makeWorkspaceTempDir } from '../../shared/runtime/paths.js';
import {
    readLedger,
    recordRender,
    bestFor,
    winningChoices,
    topicSimilarity,
    ledgerStats,
    type RenderRecord,
} from './render-ledger.js';

function tmpLedger(): string {
    const dir = makeWorkspaceTempDir('ledger-test-');
    return path.join(dir, 'render-ledger.json');
}

test('readLedger returns [] for missing/corrupt files (never throws)', () => {
    assert.deepEqual(readLedger(path.join(makeWorkspaceTempDir('ledger-missing-'), 'nope.json')), []);
    const bad = path.join(makeWorkspaceTempDir('ledger-bad-'), 'bad.json');
    fs.writeFileSync(bad, '{ not json');
    assert.deepEqual(readLedger(bad), []);
});

test('recordRender appends and persists atomically', () => {
    const file = tmpLedger();
    const ok = recordRender(
        { topic: 'react hooks tutorial', choices: { paletteFilter: 'warm' }, outcome: { gatePass: true, score: 0.9 } },
        file,
    );
    assert.equal(ok, true);
    const all = readLedger(file);
    assert.equal(all.length, 1);
    assert.equal(all[0].topic, 'react hooks tutorial');
    assert.ok(typeof all[0].ts === 'number');
    // no leftover temp file
    assert.equal(fs.existsSync(file + '.tmp'), false);
});

test('topicSimilarity: overlapping words score higher than unrelated', () => {
    const s1 = topicSimilarity('learn react hooks fast', 'react hooks deep dive');
    const s2 = topicSimilarity('learn react hooks fast', 'baking sourdough bread');
    assert.ok(s1 > s2);
    assert.ok(s1 > 0.2);
    assert.equal(s2, 0);
});

test('bestFor picks the highest score among equally-similar, passing renders', () => {
    const file = tmpLedger();
    // Both python records share exactly the same overlap with the query
    // ("python async") so ranking is decided by score, not similarity.
    recordRender({ topic: 'python async basics', choices: { paletteFilter: 'cool' }, outcome: { gatePass: true, score: 0.6 } }, file);
    recordRender({ topic: 'python async advanced', choices: { paletteFilter: 'vivid' }, outcome: { gatePass: true, score: 0.95 } }, file);
    recordRender({ topic: 'gardening tips', choices: { paletteFilter: 'warm' }, outcome: { gatePass: true, score: 0.99 } }, file);
    const best = bestFor('python async', { file });
    assert.ok(best, 'expected a match');
    assert.equal(best!.choices.paletteFilter, 'vivid', 'should pick the higher-scoring python render, not the unrelated gardening one');
});

test('bestFor returns null when nothing is similar enough', () => {
    const file = tmpLedger();
    recordRender({ topic: 'gardening tips', choices: {}, outcome: { gatePass: true, score: 0.99 } }, file);
    assert.equal(bestFor('quantum computing lecture', { file }), null);
});

test('bestFor skips failed renders when requireGatePass (default)', () => {
    const file = tmpLedger();
    recordRender({ topic: 'docker basics', choices: { preset: 'A' }, outcome: { gatePass: false, score: 0.99 } }, file);
    assert.equal(bestFor('docker basics tutorial', { file }), null);
    // but includes them when explicitly allowed
    const any = bestFor('docker basics tutorial', { file, requireGatePass: false });
    assert.ok(any);
    assert.equal(any!.choices.preset, 'A');
});

test('winningChoices returns most common values among high-scorers', () => {
    const file = tmpLedger();
    recordRender({ topic: 'ai news weekly', choices: { transition: 'fade', captionTheme: 'bold' }, outcome: { gatePass: true, score: 0.9 } }, file);
    recordRender({ topic: 'ai news roundup', choices: { transition: 'fade', captionTheme: 'neon' }, outcome: { gatePass: true, score: 0.85 } }, file);
    recordRender({ topic: 'ai news update', choices: { transition: 'slide', captionTheme: 'bold' }, outcome: { gatePass: true, score: 0.8 } }, file);
    const win = winningChoices('ai news today', { file });
    assert.equal(win.transition, 'fade', 'fade won 2 of 3');
    assert.equal(win.captionTheme, 'bold', 'bold won 2 of 3');
});

test('ring buffer caps ledger growth', () => {
    const file = tmpLedger();
    // MAX_RECORDS is 500; write 520 and confirm cap holds and keeps newest.
    for (let i = 0; i < 520; i++) {
        recordRender({ topic: `topic ${i}`, choices: {}, outcome: { gatePass: true, score: 0.5 } }, file);
    }
    const all = readLedger(file);
    assert.ok(all.length <= 500, `capped at 500, got ${all.length}`);
    assert.equal(all[all.length - 1].topic, 'topic 519', 'newest retained');
    // early records dropped: topic 0 must be gone once we exceed the cap.
    assert.ok(!all.some((r) => r.topic === 'topic 0'), 'oldest dropped');
});

test('ledgerStats summarises the store', () => {
    const file = tmpLedger();
    recordRender({ topic: 'a', choices: {}, outcome: { gatePass: true, score: 0.8 } }, file);
    recordRender({ topic: 'b', choices: {}, outcome: { gatePass: false, score: 0.2 } }, file);
    const s = ledgerStats(file);
    assert.equal(s.total, 2);
    assert.equal(s.passed, 1);
    assert.equal(s.topics, 2);
    assert.ok(s.avgScore > 0.4 && s.avgScore < 0.6);
});
