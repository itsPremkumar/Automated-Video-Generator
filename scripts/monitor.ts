/**
 * monitor.ts — progress monitor for a running agentic batch / variety log.
 *
 * Parses a log file (default workspace/tmp/combo_matrix.log) produced by
 * `agentic-batch.ts` or `gen-variety.ts` and reports, at a glance:
 *   - Output:   successes (lines like "Output:" / "✅ <path>" / "✔ ...")
 *   - Job failed / ❌ lines  (real failures)
 *   - Unhandled TypeError|ReferenceError|ENOENT|ENOENT (excluding the two
 *     KNOWN-GOOD fallbacks: voice-backend→Edge-TTS, music-duck flat-volume)
 *
 * Usage:
 *   npx tsx scripts/monitor.ts [logFile]
 *   watch:  while true; do npx tsx scripts/monitor.ts workspace/tmp/combo_matrix.log; sleep 5; done
 */
import * as fs from 'fs';

const LOG = process.argv[2] || 'workspace/tmp/combo_matrix.log';

const KNOWN_FALLBACK = [
  'falling back to Edge-TTS',
  'using flat volume',
  'music duck expression unsupported',
  'backend process exited early',
  'voicebox backend unavailable',
  'kokoro voice stage unavailable',
];

function main() {
  if (!fs.existsSync(LOG)) {
    console.error(`No log at ${LOG}`);
    process.exit(2);
  }
  const text = fs.readFileSync(LOG, 'utf8');
  const lines = text.split('\n');

  let ok = 0;
  let fail = 0;
  let realErr = 0;
  const errSamples: string[] = [];

  for (const l of lines) {
    if (/Output:\s*\S|✅\s+\S|✔\s|Composed \d+ scene/.test(l)) ok++;
    if (/Job failed|❌\s+\S|rendered 0 scene|No approved visuals to render/.test(l)) fail++;
    // Unhandled JS errors that are NOT the two known fallbacks.
    const isErrLine = /\b(TypeError|ReferenceError|RangeError|ENOENT|ENOTFOUND|Error:)\b/.test(l);
    if (isErrLine && !KNOWN_FALLBACK.some((k) => l.includes(k))) {
      realErr++;
      if (errSamples.length < 8) errSamples.push(l.trim().slice(0, 160));
    }
  }

  console.log(`=== monitor: ${LOG} ===`);
  console.log(`success markers : ${ok}`);
  console.log(`failed markers  : ${fail}`);
  console.log(`real JS errors  : ${realErr}  (known fallbacks excluded)`);
  if (realErr) {
    console.log('error samples:');
    for (const s of errSamples) console.log('  - ' + s);
  }
  const verdict = realErr === 0 ? 'HEALTHY' : 'ERRORS PRESENT';
  console.log(`verdict: ${verdict}`);
  process.exit(realErr === 0 ? 0 : 1);
}

main();
