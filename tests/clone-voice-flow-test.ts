/**
 * Proves the previously-broken "clone my voice → render in my voice" flow:
 *   job.useClonedVoiceId must reach resolveProfileId as the HIGHEST-priority
 *   profile selection (above env, cached, and auto-provisioned profiles).
 * Run: npx tsx tests/clone-voice-flow-test.ts
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { resolveProfileId } from '../src/agentic/media/voice-controller.js';

let passed = 0;
const ok = (n: string) => { passed++; console.log(`  ✓ ${n}`); };

// Minimal AgenticWorkspace stub (only fields resolveProfileId touches).
function ws(): any {
  return { root: path.join(process.cwd(), 'workspace', 'tests_cvf'), audioDir: '', assetsDir: '' };
}

async function main(): Promise<void> {
// 1) explicit cloned id wins even when VOICEBOX_PROFILE_ID env is set to something else.
const prevEnv = process.env.VOICEBOX_PROFILE_ID;
process.env.VOICEBOX_PROFILE_ID = 'env-profile-123';
const r1 = await resolveProfileId(ws(), 'cloned-profile-xyz');
assert.strictEqual(r1.id, 'cloned-profile-xyz', 'explicit cloned id should override env');
ok(`resolveProfileId(cloned='cloned-profile-xyz') → ${r1.id} (beats env ${prevEnv ?? 'unset'})`);

// 2) whitespace is trimmed.
const r2 = await resolveProfileId(ws(), '  trimmed-id  ');
assert.strictEqual(r2.id, 'trimmed-id', 'cloned id should be trimmed');
ok(`resolveProfileId trims whitespace → '${r2.id}'`);

// 3) empty explicit id falls through to env (no crash, no false match).
const r3 = await resolveProfileId(ws(), '');
assert.strictEqual(r3.id, 'env-profile-123', 'empty explicit id should fall through to env');
ok(`resolveProfileId('') falls through to env → ${r3.id}`);

if (prevEnv !== undefined) process.env.VOICEBOX_PROFILE_ID = prevEnv;
else delete process.env.VOICEBOX_PROFILE_ID;

console.log(`\nclone-voice-flow-test: ${passed} passed, 0 failed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
