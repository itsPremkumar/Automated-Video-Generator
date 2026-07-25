/**
 * ledger-prime.test.ts — proves the L3 read-side actually primes future renders
 * from ledger history (the half of self-improving that was previously dead code).
 * Uses a temp ledger under workspace/tmp (never system TEMP, per containment).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { makeWorkspaceTempDir } from '../../shared/runtime/paths.js';
import { recordRender } from './render-ledger.js';
import { primeInputFromLedger, NEAR_DUP_SIMILARITY } from './ledger-prime.js';
import { resolveConfig, type AgenticConfig } from '../config.js';

function tmpLedger(): string {
    const dir = makeWorkspaceTempDir('ledger-prime-test-');
    return path.join(dir, 'render-ledger.json');
}

const BASE: Partial<AgenticConfig> = { topic: 'react hooks tutorial', title: 'React Hooks' };

test('primeInputFromLedger is a strict no-op when the ledger is empty', () => {
    const input = { topic: 'react hooks tutorial' };
    const primed = primeInputFromLedger(input, 'react hooks tutorial', tmpLedger());
    // No history => returned object equals the input (no priming applied).
    assert.equal((primed as any).__ledgerPrimedFrom, undefined);
    assert.equal(primed.aspect, undefined); // no field injected
});

test('primeInputFromLedger reuses the whole genome for a near-duplicate topic', () => {
    const file = tmpLedger();
    recordRender(
        {
            topic: 'react hooks deep dive',
            choices: { aspect: '1:1', transition: 'zoomblur', captionTheme: 'highContrast', musicIntensity: 'energetic' },
            outcome: { gatePass: true, score: 0.95 },
        },
        file,
    );
    const input = { topic: 'react hooks deep tutorial' }; // near-dup of 'react hooks deep dive' (sim ≥ 0.5)
    const primed = primeInputFromLedger(input, 'react hooks deep tutorial', file);
    assert.equal(primed.aspect, '1:1', 'near-dup => reuse proven aspect');
    assert.equal(primed.transition, 'zoomblur', 'near-dup => reuse proven transition');
    assert.equal(primed.captionTheme, 'highContrast');
    assert.equal(primed.musicIntensity, 'energetic');
    assert.ok((primed as any).__ledgerPrimedFrom?.includes('bestFor'), 'auditable source recorded');
    assert.ok((primed as any).__ledgerPrimedFrom?.includes('near-dup'));
});

test('primeInputFromLedger respects explicit user overrides (never overwrites)', () => {
    const file = tmpLedger();
    recordRender(
        { topic: 'react hooks deep dive', choices: { aspect: '1:1' }, outcome: { gatePass: true, score: 0.95 } },
        file,
    );
    // User explicitly chose 16:9 — ledger must NOT override it.
    const input = { topic: 'react hooks for beginners', aspect: '16:9' as const };
    const primed = primeInputFromLedger(input, 'react hooks for beginners', file);
    assert.equal(primed.aspect, '16:9', 'user override wins over ledger');
});

test('primeInputFromLedger fills gaps with consensus when only loosely similar', () => {
    const file = tmpLedger();
    recordRender({ topic: 'ai news weekly', choices: { transition: 'fade', captionTheme: 'bold' }, outcome: { gatePass: true, score: 0.9 } }, file);
    recordRender({ topic: 'ai news roundup', choices: { transition: 'fade', captionTheme: 'neon' }, outcome: { gatePass: true, score: 0.85 } }, file);
    recordRender({ topic: 'ai news update', choices: { transition: 'slide', captionTheme: 'bold' }, outcome: { gatePass: true, score: 0.8 } }, file);
    // Query is similar but not a near-dup; open fields fill from consensus.
    const input = { topic: 'ai news today' };
    const primed2 = primeInputFromLedger(input, 'ai news today', file);
    assert.equal(primed2.transition, 'fade', 'consensus transition wins');
    assert.equal(primed2.captionTheme, 'bold', 'consensus captionTheme wins');
    assert.ok((primed2 as any).__ledgerPrimedFrom?.includes('winningChoices'));
});

test('primeInputFromLedger degrades to no-op on any error (corrupt ledger)', () => {
    const bad = path.join(makeWorkspaceTempDir('ledger-prime-bad-'), 'bad.json');
    fs.writeFileSync(bad, '{ not json');
    const input = { topic: 'react hooks tutorial' };
    const primed = primeInputFromLedger(input, 'react hooks', bad);
    assert.equal((primed as any).__ledgerPrimedFrom, undefined);
    assert.equal(primed.aspect, undefined);
});

test('NEAR_DUP_SIMILARITY threshold is sane', () => {
    assert.ok(NEAR_DUP_SIMILARITY >= 0.3 && NEAR_DUP_SIMILARITY <= 0.9);
});
