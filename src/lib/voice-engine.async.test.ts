/**
 * voice-engine.async.test.ts — regression guard for the Windows voiceover HANG
 * (BUG #6).
 *
 * The old `runPowerShellEncoded` used `spawnSync(..., { timeout })` which,
 * on Windows, does NOT return when powershell.exe spawns a conhost.exe
 * grandchild keeping the stdio pipe open — the 120s timeout killed the direct
 * child but spawnSync never resolved, freezing the entire render (observed
 * 10+ minute freeze). `runPowerShellEncodedAsync` instead spawns
 * asynchronously and KILLS THE PROCESS TREE (taskkill /F /T /PID) on a
 * hard timer, so it can never hang.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPowerShellEncodedAsync } from './voice-engine.js';

test('async runner: a slow command is killed by the tree-kill timer, never hangs', async () => {
    const t0 = Date.now();
    // `timeout 600` is a command that sleeps — but we cap at 2s so the
    // hard timer MUST fire and resolve well before 600s.
    const r = await runPowerShellEncodedAsync('Start-Sleep -Seconds 600', process.env, 2000);
    const el = Date.now() - t0;
    assert.ok(r.timedOut, `expected timedOut=true (status=${r.status})`);
    assert.ok(el < 12000, `must not hang; elapsed ${el}ms`);
    assert.strictEqual(typeof r.status, 'number'); // null (killed) or exit code
});

test('async runner: a fast command resolves normally', async () => {
    const t0 = Date.now();
    const r = await runPowerShellEncodedAsync('Write-Output "ok"', process.env, 10000);
    assert.strictEqual(r.timedOut, false);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /ok/);
    assert.ok((Date.now() - t0) < 10000);
});
