/**
 * repro-a3.ts — BEFORE/AFTER functional reproduction of BUG A3
 * (voiceover render crash on slim `voiceovers` shape).
 *
 * Runs from the worktree root via `npx tsx src/agentic/orchestrator/repro-a3.ts`.
 *
 * BEFORE (simulated by inlining the OLD indexing logic): throws
 *   TypeError: Cannot read properties of undefined (reading '0')
 * AFTER (the fixed sceneVoicePath used at render.ts:736): returns undefined
 *   (renderer falls back to a silent anullsrc track — no crash).
 *
 * This proves the fix at the exact code site without needing a full ffmpeg
 * render (the bug is purely in the JS property access, not in encoding).
 */
import assert from 'node:assert/strict';
import { sceneVoicePath } from './render.js';

// The SLIM shape the modular CLI writes when the voice stage produces no
// per-scene WAVs — exactly what previously reached render.ts:736.
const slimVoiceovers: any = { voiceoverDriven: false, sceneCount: 0, fallbackUsed: true };

// ── BEFORE: the original, buggy accessor (verbatim logic) ──
function oldAccessor(vo: any, idx: number): string | undefined {
  // This is what render.ts:736 USED to do — no `?.` on `.scenes`.
  return vo?.scenes[idx]?.audioPath; // throws: vo.scenes is undefined
}

// ── AFTER: the fixed accessor (sceneVoicePath) ──
const after = sceneVoicePath(slimVoiceovers, 0);

// Demonstrate the BEFORE crash deterministically.
let beforeThrew = false;
let beforeMessage = '';
try {
  oldAccessor(slimVoiceovers, 0);
} catch (e: any) {
  beforeThrew = true;
  beforeMessage = e?.message ?? String(e);
}

// Assertions — the proof.
console.log('BEFORE (old code) threw TypeError :', beforeThrew, beforeMessage);
console.log('AFTER  (fixed code) returned      :', after, '(undefined = silent fallback, no crash)');

assert.ok(beforeThrew, 'EXPECTED: old code should throw on slim voiceovers shape');
assert.match(beforeMessage, /Cannot read properties of undefined/, 'old error must be the A3 TypeError');
assert.equal(after, undefined, 'fixed code must return undefined, never throw');

console.log('\n✅ A3 reproduction PASSED: old code crashes, fixed code is safe.');
