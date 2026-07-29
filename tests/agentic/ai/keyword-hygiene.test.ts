/**
 * Regression: heuristic script visuals must never be stopword-led.
 *
 * Bug (found in matrix QA): topic "The turtle who learned to fly" produced
 * scene visual searches for "the" / "the close up" — every fetch timed out
 * (12s each) or returned junk candidates. writeScriptHeuristic now filters
 * stopwords out of topicParts before building visual angles.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeScriptHeuristic } from '../../../src/agentic/ai/agent.js';

const STOPWORD_LED = /(^|\s)(the|and|who|that|this|with|from|for|you|your|how|why|what|when)(\s|$)/i;

function visualsOf(script: string): string[] {
    return [...script.matchAll(/\[Visual: ([^\]]+)\]/g)].map((m) => m[1].trim());
}

describe('writeScriptHeuristic keyword hygiene', () => {
    it('stopword-heavy topic yields content-noun visuals', () => {
        const s = writeScriptHeuristic('The turtle who learned to fly', 'Kids story');
        const visuals = visualsOf(s);
        assert.ok(visuals.length >= 3, `expected >=3 visuals, got ${visuals.length}`);
        for (const v of visuals) {
            assert.ok(!STOPWORD_LED.test(v), `stopword-led visual: "${v}"`);
            assert.ok(v.length > 2, `too-short visual: "${v}"`);
        }
        // the actual content noun must survive
        assert.ok(visuals.some((v) => v.includes('turtle')), `topic noun lost: ${visuals.join(' | ')}`);
    });

    it('normal topics still produce distinct per-scene visuals', () => {
        const s = writeScriptHeuristic('How solar panels turn sunlight into electricity', 'Solar');
        const visuals = visualsOf(s);
        assert.ok(new Set(visuals).size >= 2, `visuals not varied: ${visuals.join(' | ')}`);
        for (const v of visuals) assert.ok(!STOPWORD_LED.test(v), `stopword-led visual: "${v}"`);
    });

    it('all-stopword topic falls back to a usable noun (never empty)', () => {
        const s = writeScriptHeuristic('The who and what', 'X');
        for (const v of visualsOf(s)) assert.ok(v.trim().length > 0, 'empty visual keyword');
    });
});
